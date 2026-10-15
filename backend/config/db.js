import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z', // DATETIME values (auction end times) are stored and read as UTC
});

/**
 * Runs `work(conn)` inside a transaction. Commits on success, rolls back on error, retries on deadlock.
 * Lock order used everywhere: items -> transactions -> requests (keeps concurrent flows deadlock-free).
 * Used from Phase 5 onward for request acceptance and transaction completion.
 */
export async function withTransaction(work, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      // 1213 = deadlock victim. The whole transaction was rolled back, so it is safe to run it again.
      if (err.errno === 1213 && attempt < attempts) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}

export async function testConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}

export default pool;
