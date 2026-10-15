import pool, { withTransaction } from '../config/db.js';
import AppError from '../utils/AppError.js';
import { notify } from './notificationService.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const SNIPE_WINDOW_MIN = 2; // a bid in the last 2 minutes extends the auction by 2 minutes

/** Public bid history. Names are shortened ("Ananya R.") so bidders' full names aren't exposed. */
export async function getBids(itemId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.amount, b.created_at, u.full_name
     FROM bids b JOIN auctions a ON a.id = b.auction_id JOIN users u ON u.id = b.bidder_id
     WHERE a.item_id = ? ORDER BY b.amount DESC, b.id DESC LIMIT 50`, [itemId]);
  const short = (n) => { const [f, ...r] = n.split(' '); return r.length ? `${f} ${r[r.length - 1][0]}.` : f; };
  return rows.map((b) => ({ id: b.id, amount: Number(b.amount), bidder: short(b.full_name), createdAt: b.created_at }));
}

export async function placeBid(user, itemId, rawAmount) {
  const amount = round2(rawAmount);
  return withTransaction(async (conn) => {
    await conn.query('SELECT id FROM items WHERE id = ? FOR UPDATE', [itemId]); // item first (global lock order)
    // Locks the auction row (and its item): concurrent bids are processed one at a time.
    const [rows] = await conn.query(
      `SELECT a.*, i.owner_id, i.title, i.is_removed, (a.ends_at > UTC_TIMESTAMP()) AS still_open
       FROM auctions a JOIN items i ON i.id = a.item_id WHERE a.item_id = ? FOR UPDATE`, [itemId]);
    const a = rows[0];
    if (!a || a.is_removed) throw new AppError('Auction not found', 404);
    if (a.owner_id === user.id) throw new AppError('You cannot bid on your own listing', 403);
    if (a.status !== 'active' || !a.still_open) throw new AppError('This auction has ended', 409);
    if (a.highest_bidder_id === user.id) throw new AppError('You already have the highest bid', 409);

    const minimum = a.bid_count === 0 ? Number(a.starting_price) : round2(Number(a.current_price) + Number(a.min_increment));
    if (amount < minimum) throw new AppError(`Your bid must be at least ${minimum}`, 400);

    await conn.query('INSERT INTO bids (auction_id, bidder_id, amount) VALUES (?, ?, ?)', [a.id, user.id, amount]);
    await conn.query(
      `UPDATE auctions SET current_price = ?, highest_bidder_id = ?, bid_count = bid_count + 1,
         ends_at = IF(ends_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ends_at)
       WHERE id = ?`, [amount, user.id, SNIPE_WINDOW_MIN, SNIPE_WINDOW_MIN, a.id]);

    if (a.highest_bidder_id) await notify(conn, a.highest_bidder_id, 'outbid', 'You have been outbid', `Someone placed a higher bid on "${a.title}".`, itemId);
    await notify(conn, a.owner_id, 'bid_received', 'New bid on your auction', `A new bid of ${amount} was placed on "${a.title}".`, itemId);

    const [[fresh]] = await conn.query('SELECT current_price, bid_count, ends_at FROM auctions WHERE id = ?', [a.id]);
    return { currentPrice: Number(fresh.current_price), bidCount: fresh.bid_count, endsAt: fresh.ends_at, isHighestBidder: true };
  });
}

/** Closes one auction if its time is up. Safe to call repeatedly and concurrently. */
export async function finalizeAuction(auctionId) {
  const [pre] = await pool.query('SELECT item_id FROM auctions WHERE id = ?', [auctionId]);
  if (!pre[0]) return;
  await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM items WHERE id = ? FOR UPDATE', [pre[0].item_id]);
    const [rows] = await conn.query(
      `SELECT a.*, i.owner_id, i.title FROM auctions a JOIN items i ON i.id = a.item_id
       WHERE a.id = ? AND a.status = 'active' AND a.ends_at <= UTC_TIMESTAMP() FOR UPDATE`, [auctionId]);
    const a = rows[0];
    if (!a) return; // already finalized by someone else, or not due yet

    if (a.bid_count > 0 && a.highest_bidder_id) {
      await conn.query(`UPDATE auctions SET status='ended', winner_id=?, final_price=?, ended_at=UTC_TIMESTAMP() WHERE id=?`,
        [a.highest_bidder_id, a.current_price, a.id]);
      await conn.query(`UPDATE items SET status='reserved' WHERE id=?`, [a.item_id]);
      const [t] = await conn.query(
        `INSERT INTO transactions (auction_id, transaction_type, requester_id, owner_id, item_id, agreed_price)
         VALUES (?, 'auction', ?, ?, ?, ?)`, [a.id, a.highest_bidder_id, a.owner_id, a.item_id, a.current_price]);
      await notify(conn, a.highest_bidder_id, 'auction_won', 'You won the auction!', `You won "${a.title}" for ${a.current_price}. Arrange the handover and confirm it in Transactions.`, a.item_id);
      await notify(conn, a.owner_id, 'auction_ended', 'Your auction has ended', `"${a.title}" sold for ${a.current_price}. Arrange the handover and confirm it in Transactions.`, a.item_id);
      const [losers] = await conn.query('SELECT DISTINCT bidder_id FROM bids WHERE auction_id = ? AND bidder_id <> ?', [a.id, a.highest_bidder_id]);
      for (const l of losers) await notify(conn, l.bidder_id, 'auction_ended', 'Auction ended', `You did not win "${a.title}".`, a.item_id);
    } else {
      await conn.query(`UPDATE auctions SET status='ended', ended_at=UTC_TIMESTAMP() WHERE id=?`, [a.id]);
      await notify(conn, a.owner_id, 'auction_ended', 'Your auction ended with no bids', `"${a.title}" received no bids. You can relist it from My listings.`, a.item_id);
    }
  });
}

export async function finalizeIfDue(itemId) {
  const [rows] = await pool.query(`SELECT id FROM auctions WHERE item_id = ? AND status = 'active' AND ends_at <= UTC_TIMESTAMP()`, [itemId]);
  if (rows[0]) await finalizeAuction(rows[0].id);
}

export async function finalizeDue() {
  const [rows] = await pool.query(`SELECT id FROM auctions WHERE status = 'active' AND ends_at <= UTC_TIMESTAMP() LIMIT 100`);
  for (const r of rows) await finalizeAuction(r.id);
  return rows.length;
}

export async function cancelAuction(user, itemId) {
  await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM items WHERE id = ? FOR UPDATE', [itemId]);
    const [rows] = await conn.query(
      `SELECT a.*, i.owner_id, i.title FROM auctions a JOIN items i ON i.id = a.item_id WHERE a.item_id = ? FOR UPDATE`, [itemId]);
    const a = rows[0];
    if (!a) throw new AppError('Auction not found', 404);
    if (a.owner_id !== user.id) throw new AppError('You can only cancel your own auctions', 403);
    if (a.status !== 'active') throw new AppError('This auction is not active', 409);
    await conn.query(`UPDATE auctions SET status='cancelled', ended_at=UTC_TIMESTAMP() WHERE id=?`, [a.id]);
    const [bidders] = await conn.query('SELECT DISTINCT bidder_id FROM bids WHERE auction_id = ?', [a.id]);
    for (const b of bidders) await notify(conn, b.bidder_id, 'auction_ended', 'Auction cancelled', `The seller cancelled the auction for "${a.title}".`, itemId);
  });
}

export async function relistAuction(user, itemId, hours) {
  await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM items WHERE id = ? FOR UPDATE', [itemId]);
    const [rows] = await conn.query(
      `SELECT a.*, i.owner_id, i.status AS item_status FROM auctions a JOIN items i ON i.id = a.item_id WHERE a.item_id = ? FOR UPDATE`, [itemId]);
    const a = rows[0];
    if (!a) throw new AppError('Auction not found', 404);
    if (a.owner_id !== user.id) throw new AppError('You can only relist your own auctions', 403);
    if (a.status === 'active' || a.bid_count > 0 || a.item_status !== 'available')
      throw new AppError('Only an auction that ended or was cancelled without bids can be relisted', 409);
    await conn.query(
      `UPDATE auctions SET status='active', starts_at=UTC_TIMESTAMP(), ends_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR),
         current_price=starting_price, ended_at=NULL WHERE id=?`, [hours, a.id]);
  });
}
