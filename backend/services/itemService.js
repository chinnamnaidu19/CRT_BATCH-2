import pool, { withTransaction } from '../config/db.js';
import AppError from '../utils/AppError.js';
import { saveImages, deleteImages } from '../utils/images.js';
import { finalizeIfDue } from './auctionService.js';
import { pageMeta } from '../utils/pagination.js';

const MAX_IMAGES = 5;

const ITEM_SELECT = `
  SELECT i.*, c.name AS category_name, c.slug AS category_slug,
         u.full_name AS owner_name, u.college AS owner_college, u.department AS owner_department, u.profile_image AS owner_image,
         a.id AS auction_id, a.starting_price, a.min_increment, a.current_price, a.bid_count, a.ends_at,
         a.status AS auction_status, a.highest_bidder_id
  FROM items i
  JOIN categories c ON c.id = i.category_id
  JOIN users u ON u.id = i.owner_id
  LEFT JOIN auctions a ON a.item_id = i.id`;

const num = (v) => (v === null || v === undefined ? null : Number(v));

export function toItemDto(r, images = []) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: { id: r.category_id, name: r.category_name, slug: r.category_slug },
    listingType: r.listing_type,
    condition: r.item_condition,
    price: num(r.price),
    college: r.college,
    status: r.status,
    images,
    owner: { id: r.owner_id, fullName: r.owner_name, college: r.owner_college, department: r.owner_department, profileImage: r.owner_image },
    auction: r.auction_id
      ? {
          id: r.auction_id,
          startingPrice: num(r.starting_price),
          minIncrement: num(r.min_increment),
          currentPrice: num(r.current_price),
          bidCount: r.bid_count,
          endsAt: r.ends_at,
          status: r.auction_status,
        }
      : null,
    createdAt: r.created_at,
  };
}

async function imagesFor(ids, conn = pool) {
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const [rows] = await conn.query(
    'SELECT id, item_id, image_path FROM item_images WHERE item_id IN (?) ORDER BY sort_order, id',
    [ids]
  );
  rows.forEach((r) => map.get(r.item_id).push({ id: r.id, url: r.image_path }));
  return map;
}

export async function getItem(id, viewer = null) {
  await finalizeIfDue(id); // closes the auction lazily if its time is up
  const [rows] = await pool.query(`${ITEM_SELECT} WHERE i.id = ? AND i.is_removed = 0`, [id]);
  if (!rows[0]) throw new AppError('Listing not found', 404);
  const imgs = await imagesFor([id]);
  const dto = toItemDto(rows[0], imgs.get(id));

  if (viewer) {
    const [[w]] = await pool.query('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ? AND item_id = ?', [viewer.id, id]);
    const [pr] = await pool.query(
      `SELECT id, request_type FROM exchange_requests WHERE requester_id = ? AND requested_item_id = ? AND status = 'pending' LIMIT 1`, [viewer.id, id]);
    dto.viewer = {
      isOwner: viewer.id === rows[0].owner_id,
      inWishlist: w.n > 0,
      isHighestBidder: Boolean(rows[0].highest_bidder_id) && rows[0].highest_bidder_id === viewer.id,
      pendingRequest: pr[0] ? { id: pr[0].id, type: pr[0].request_type } : null,
    };
  }
  return dto;
}

/** Items visible in browsing: available, not removed, and (for auctions) still running. */
const VISIBLE = `i.status = 'available' AND i.is_removed = 0 AND (a.id IS NULL OR (a.status = 'active' AND a.ends_at > UTC_TIMESTAMP()))`;
const PRICE_EXPR = 'COALESCE(i.price, a.current_price)';
const escapeLike = (t) => t.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Loads full item DTOs for the given ids, keeping the order of `ids`. */
export async function loadItemsByIds(ids) {
  if (!ids.length) return [];
  const [rows] = await pool.query(`${ITEM_SELECT} WHERE i.id IN (?) AND i.is_removed = 0`, [ids]);
  const imgs = await imagesFor(rows.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, toItemDto(r, imgs.get(r.id))]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function browse(q) {
  const page = q.page || 1, limit = q.limit || 12;
  const where = [VISIBLE];
  const params = [];

  if (q.q) {
    for (const term of q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
      where.push('(i.title LIKE ? OR i.description LIKE ?)');
      params.push(`%${escapeLike(term)}%`, `%${escapeLike(term)}%`);
    }
  }
  if (q.category) {
    if (/^\d+$/.test(q.category)) { where.push('i.category_id = ?'); params.push(Number(q.category)); }
    else { where.push('c.slug = ?'); params.push(q.category); }
  }
  if (q.type === 'sale') where.push("i.listing_type IN ('sale','both')");
  else if (q.type === 'exchange') where.push("i.listing_type IN ('exchange','both')");
  else if (q.type === 'auction') where.push("i.listing_type = 'auction'");
  if (q.condition) { where.push('i.item_condition = ?'); params.push(q.condition); }
  if (q.college) { where.push('i.college LIKE ?'); params.push(`%${escapeLike(q.college)}%`); }
  if (q.minPrice !== undefined) { where.push(`${PRICE_EXPR} >= ?`); params.push(q.minPrice); }
  if (q.maxPrice !== undefined) { where.push(`${PRICE_EXPR} <= ?`); params.push(q.maxPrice); }

  const order = {
    price_asc: `${PRICE_EXPR} IS NULL, ${PRICE_EXPR} ASC, i.id DESC`,
    price_desc: `${PRICE_EXPR} IS NULL, ${PRICE_EXPR} DESC, i.id DESC`,
    ending_soon: 'a.ends_at IS NULL, a.ends_at ASC, i.id DESC',
  }[q.sort] || 'i.created_at DESC, i.id DESC';

  const from = `FROM items i JOIN categories c ON c.id = i.category_id LEFT JOIN auctions a ON a.item_id = i.id WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
  const [idRows] = await pool.query(`SELECT i.id ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  return { items: await loadItemsByIds(idRows.map((r) => r.id)), ...pageMeta(page, limit, total) };
}

export async function collegeList() {
  const [rows] = await pool.query(`SELECT DISTINCT i.college FROM items i LEFT JOIN auctions a ON a.item_id = i.id WHERE ${VISIBLE} ORDER BY i.college LIMIT 100`);
  return rows.map((r) => r.college);
}

/** Everything the home page needs in a handful of queries. */
export async function storefront() {
  const [cats] = await pool.query('SELECT id, name, slug FROM categories ORDER BY id');
  const [counts] = await pool.query(`SELECT i.category_id, COUNT(*) AS n FROM items i LEFT JOIN auctions a ON a.item_id = i.id WHERE ${VISIBLE} GROUP BY i.category_id`);
  const [perCat] = await pool.query(
    `SELECT id, category_id FROM (
       SELECT i.id, i.category_id, ROW_NUMBER() OVER (PARTITION BY i.category_id ORDER BY i.created_at DESC, i.id DESC) AS rn
       FROM items i LEFT JOIN auctions a ON a.item_id = i.id WHERE ${VISIBLE}) t
     WHERE rn <= 8 ORDER BY category_id, rn`);
  const [ending] = await pool.query(`SELECT i.id FROM items i JOIN auctions a ON a.item_id = i.id WHERE ${VISIBLE} ORDER BY a.ends_at ASC LIMIT 8`);
  const [recent] = await pool.query(`SELECT i.id FROM items i LEFT JOIN auctions a ON a.item_id = i.id WHERE ${VISIBLE} ORDER BY i.created_at DESC, i.id DESC LIMIT 8`);

  const all = await loadItemsByIds([...new Set([...perCat.map((r) => r.id), ...ending.map((r) => r.id), ...recent.map((r) => r.id)])]);
  const byId = new Map(all.map((i) => [i.id, i]));
  const countMap = new Map(counts.map((c) => [c.category_id, c.n]));

  return {
    categories: cats.map((c) => {
      const items = perCat.filter((r) => r.category_id === c.id).map((r) => byId.get(r.id)).filter(Boolean);
      return { ...c, itemCount: countMap.get(c.id) || 0, coverImage: items[0]?.images[0]?.url || null, items };
    }),
    endingSoon: ending.map((r) => byId.get(r.id)).filter(Boolean),
    recent: recent.map((r) => byId.get(r.id)).filter(Boolean),
  };
}

export async function listByOwner(ownerId) {
  const [rows] = await pool.query(`${ITEM_SELECT} WHERE i.owner_id = ? AND i.is_removed = 0 ORDER BY i.created_at DESC, i.id DESC`, [ownerId]);
  const imgs = await imagesFor(rows.map((r) => r.id));
  return rows.map((r) => toItemDto(r, imgs.get(r.id)));
}

async function assertCategory(categoryId, conn = pool) {
  const [rows] = await conn.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
  if (!rows.length) throw new AppError('Selected category does not exist', 400);
}

const round2 = (n) => Math.round(n * 100) / 100;

export async function createItem(user, body, files) {
  if (!files?.length) throw new AppError('Please upload at least one image of the item', 400);
  if (files.length > MAX_IMAGES) throw new AppError(`You can upload at most ${MAX_IMAGES} images`, 400);

  const isAuction = body.listingType === 'auction';
  if (isAuction && !body.durationHours) throw new AppError('Choose how long the auction should run', 400);
  await assertCategory(body.categoryId);

  const urls = await saveImages(files, 'items'); // validates every file's real type before writing
  try {
    const id = await withTransaction(async (conn) => {
      const price = isAuction || body.listingType === 'exchange' ? null : round2(body.price);
      const [res] = await conn.query(
        `INSERT INTO items (owner_id, category_id, title, description, listing_type, item_condition, price, college)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, body.categoryId, body.title, body.description, body.listingType, body.condition, price, body.college || user.college]
      );
      const itemId = res.insertId;

      await conn.query(
        'INSERT INTO item_images (item_id, image_path, sort_order) VALUES ?',
        [urls.map((u, i) => [itemId, u, i])]
      );

      if (isAuction) {
        const start = round2(body.startingPrice);
        await conn.query(
          `INSERT INTO auctions (item_id, starting_price, min_increment, current_price, starts_at, ends_at)
           VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))`,
          [itemId, start, round2(body.minIncrement || 10), start, body.durationHours]
        );
      }
      return itemId;
    });
    return await getItem(id);
  } catch (err) {
    await deleteImages(urls); // don't leave orphan files if the DB write failed
    throw err;
  }
}

export async function updateItem(user, id, body, files = []) {
  const newUrls = files.length ? await saveImages(files, 'items') : [];
  let removedUrls = [];
  try {
    await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT i.*, a.id AS auction_id, a.bid_count, a.starting_price, a.min_increment
         FROM items i LEFT JOIN auctions a ON a.item_id = i.id
         WHERE i.id = ? AND i.is_removed = 0 FOR UPDATE`, [id]);
      const item = rows[0];
      if (!item) throw new AppError('Listing not found', 404);
      if (item.owner_id !== user.id) throw new AppError('You can only edit your own listings', 403);
      if (item.status !== 'available') throw new AppError(`A ${item.status} listing can no longer be edited`, 409);

      const wasAuction = item.listing_type === 'auction';
      if (wasAuction !== (body.listingType === 'auction')) throw new AppError('A listing cannot be switched to or from an auction', 400);
      await assertCategory(body.categoryId, conn);

      let price = item.price;
      if (wasAuction) {
        const start = round2(body.startingPrice);
        const inc = round2(body.minIncrement || Number(item.min_increment));
        if (item.bid_count > 0) {
          if (start !== Number(item.starting_price) || inc !== Number(item.min_increment))
            throw new AppError('Auction prices cannot be changed after bidding has started', 409);
        } else {
          await conn.query('UPDATE auctions SET starting_price = ?, min_increment = ?, current_price = ? WHERE id = ?', [start, inc, start, item.auction_id]);
        }
        price = null;
      } else {
        price = body.listingType === 'exchange' ? null : round2(body.price);
      }

      // Images: keep the chosen existing ones, add new ones, 1-5 in total.
      const keepIds = [].concat(body.keepImageIds ?? []).map(Number).filter(Number.isInteger);
      const [existing] = await conn.query('SELECT id, image_path FROM item_images WHERE item_id = ? ORDER BY sort_order, id', [id]);
      const kept = existing.filter((e) => keepIds.includes(e.id));
      const total = kept.length + newUrls.length;
      if (total < 1) throw new AppError('A listing must have at least one image', 400);
      if (total > MAX_IMAGES) throw new AppError(`A listing can have at most ${MAX_IMAGES} images`, 400);

      const removed = existing.filter((e) => !keepIds.includes(e.id));
      if (removed.length) await conn.query('DELETE FROM item_images WHERE id IN (?)', [removed.map((r) => r.id)]);
      if (newUrls.length)
        await conn.query('INSERT INTO item_images (item_id, image_path, sort_order) VALUES ?', [newUrls.map((u, i) => [id, u, kept.length + i])]);
      removedUrls = removed.map((r) => r.image_path);

      await conn.query(
        `UPDATE items SET category_id=?, title=?, description=?, listing_type=?, item_condition=?, price=?, college=? WHERE id=?`,
        [body.categoryId, body.title, body.description, body.listingType, body.condition, price, body.college || item.college, id]
      );
    });
  } catch (err) {
    await deleteImages(newUrls);
    throw err;
  }
  await deleteImages(removedUrls); // only after the DB commit succeeded
  return getItem(id);
}

export async function deleteItem(user, id) {
  let urls = [];
  const softDeleted = await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT i.*, a.bid_count, a.status AS auction_status FROM items i LEFT JOIN auctions a ON a.item_id = i.id
       WHERE i.id = ? AND i.is_removed = 0 FOR UPDATE`, [id]);
    const item = rows[0];
    if (!item) throw new AppError('Listing not found', 404);
    if (item.owner_id !== user.id) throw new AppError('You can only delete your own listings', 403);
    if (item.status !== 'available') throw new AppError(`A ${item.status} listing cannot be deleted`, 409);
    if (item.bid_count > 0 && item.auction_status === 'active') throw new AppError('An auction with bids cannot be deleted. Cancel the auction first.', 409);

    // Listings referenced by requests keep their history: hide them instead of erasing them.
    const [refs] = await conn.query('SELECT 1 FROM exchange_requests WHERE requested_item_id = ? OR offered_item_id = ? LIMIT 1', [id, id]);
    if (refs.length || item.bid_count > 0) {
      await conn.query('UPDATE items SET is_removed = 1 WHERE id = ?', [id]);
      return true;
    }
    const [imgs] = await conn.query('SELECT image_path FROM item_images WHERE item_id = ?', [id]);
    urls = imgs.map((r) => r.image_path);
    await conn.query('DELETE FROM items WHERE id = ?', [id]); // cascades to images and auction
    return false;
  });
  await deleteImages(urls);
  return { softDeleted };
}
