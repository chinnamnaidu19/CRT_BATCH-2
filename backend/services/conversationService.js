import pool, { withTransaction } from '../config/db.js';
import AppError from '../utils/AppError.js';
import { notify } from './notificationService.js';

async function getParticipantConversation(conn, user, id) {
  const [rows] = await conn.query('SELECT * FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)', [id, user.id, user.id]);
  // Same answer whether it doesn't exist or isn't yours, so ids can't be probed.
  if (!rows[0]) throw new AppError('Conversation not found', 404);
  return rows[0];
}

export async function startConversation(user, { userId, itemId }) {
  if (userId === user.id) throw new AppError('You cannot message yourself', 400);
  const [others] = await pool.query("SELECT id FROM users WHERE id = ? AND status = 'active'", [userId]);
  if (!others.length) throw new AppError('Student not found', 404);
  if (itemId) {
    const [it] = await pool.query('SELECT id FROM items WHERE id = ? AND is_removed = 0', [itemId]);
    if (!it.length) throw new AppError('Listing not found', 404);
  }
  const a = Math.min(user.id, userId), b = Math.max(user.id, userId);
  const [found] = await pool.query(
    `SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ? AND ${itemId ? 'item_id = ?' : 'item_id IS NULL'}`,
    itemId ? [a, b, itemId] : [a, b]);
  if (found[0]) return found[0].id;
  const [res] = await pool.query('INSERT INTO conversations (user_a_id, user_b_id, item_id) VALUES (?, ?, ?)', [a, b, itemId || null]);
  return res.insertId;
}

export async function listConversations(user) {
  const [rows] = await pool.query(
    `SELECT c.id, c.item_id, c.updated_at,
            IF(c.user_a_id = ?, c.user_b_id, c.user_a_id) AS other_id,
            u.full_name AS other_name, u.profile_image AS other_image, i.title AS item_title,
            (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
            (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id <> ? AND is_read = 0) AS unread
     FROM conversations c
     JOIN users u ON u.id = IF(c.user_a_id = ?, c.user_b_id, c.user_a_id)
     LEFT JOIN items i ON i.id = c.item_id
     WHERE c.user_a_id = ? OR c.user_b_id = ?
     ORDER BY COALESCE((SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1), c.created_at) DESC, c.id DESC LIMIT 100`,
    [user.id, user.id, user.id, user.id, user.id]);
  return rows.map((r) => ({
    id: r.id, itemId: r.item_id, itemTitle: r.item_title, updatedAt: r.updated_at,
    other: { id: r.other_id, fullName: r.other_name, profileImage: r.other_image },
    lastMessage: r.last_body, lastMessageAt: r.last_at, unread: r.unread,
  }));
}

export async function getMessages(user, id) {
  const conv = await getParticipantConversation(pool, user, id);
  const [rows] = await pool.query(
    `SELECT m.id, m.sender_id, m.body, m.is_read, m.created_at FROM messages m WHERE m.conversation_id = ? ORDER BY m.id ASC LIMIT 500`, [id]);
  const otherId = conv.user_a_id === user.id ? conv.user_b_id : conv.user_a_id;
  const [[o]] = await pool.query('SELECT id, full_name, profile_image FROM users WHERE id = ?', [otherId]);
  let item = null;
  if (conv.item_id) { const [[i]] = await pool.query('SELECT id, title FROM items WHERE id = ?', [conv.item_id]); item = i ? { id: i.id, title: i.title } : null; }
  return {
    conversation: { id: conv.id, other: { id: o.id, fullName: o.full_name, profileImage: o.profile_image }, item },
    messages: rows.map((m) => ({ id: m.id, senderId: m.sender_id, body: m.body, isRead: !!m.is_read, createdAt: m.created_at, mine: m.sender_id === user.id })),
  };
}

export async function markConversationRead(user, id) {
  await getParticipantConversation(pool, user, id);
  await pool.query('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id <> ? AND is_read = 0', [id, user.id]);
}

export async function sendMessage(user, id, body) {
  return withTransaction(async (conn) => {
    const conv = await getParticipantConversation(conn, user, id);
    const otherId = conv.user_a_id === user.id ? conv.user_b_id : conv.user_a_id;
    const [o] = await conn.query("SELECT id FROM users WHERE id = ? AND status = 'active'", [otherId]);
    if (!o.length) throw new AppError('This student is no longer available to message', 409);

    const [res] = await conn.query('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)', [id, user.id, body]);
    await conn.query('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    // One unread "new message" notification per conversation, so a chat doesn't flood the bell.
    const [existing] = await conn.query(`SELECT id FROM notifications WHERE user_id = ? AND type = 'new_message' AND related_id = ? AND is_read = 0 LIMIT 1`, [otherId, id]);
    if (!existing.length) await notify(conn, otherId, 'new_message', `New message from ${user.full_name}`, body.slice(0, 120), id);
    return { id: res.insertId, senderId: user.id, body, isRead: false, mine: true, createdAt: new Date() };
  });
}
