import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from './config/db.js';
import { solidPng } from './utils/placeholderPng.js';
import { UPLOAD_ROOT } from './utils/images.js';

const users = [
  { name: 'EduSwap Admin', email: process.env.SEED_ADMIN_EMAIL || 'admin@eduswap.local', pw: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123', college: 'EduSwap HQ', dept: 'Administration', year: 1, role: 'admin' },
  { name: 'Ananya Rao', email: 'ananya@example.com', college: 'JNTU Hyderabad', dept: 'Computer Science', year: 2, role: 'student' },
  { name: 'Karthik Reddy', email: 'karthik@example.com', college: 'JNTU Hyderabad', dept: 'Mechanical', year: 3, role: 'student' },
  { name: 'Sneha Iyer', email: 'sneha@example.com', college: 'Osmania University', dept: 'Electronics', year: 2, role: 'student' },
];
const studentPw = process.env.SEED_STUDENT_PASSWORD || 'Student123';

for (const u of users) {
  const hash = await bcrypt.hash(u.pw || studentPw, 12);
  const [res] = await pool.query(
    `INSERT IGNORE INTO users (full_name, email, password_hash, college, department, academic_year, role)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [u.name, u.email, hash, u.college, u.dept, u.year, u.role]);
  console.log(`${res.affectedRows ? 'created' : 'exists '} ${u.role.padEnd(7)} ${u.email}`);
}

// ---- Sample listings (skipped if any listings already exist) ----
const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM items');
if (n > 0) {
  console.log('Listings already exist; skipping sample listings.');
} else {
  const uid = async (email) => (await pool.query('SELECT id FROM users WHERE email = ?', [email]))[0][0].id;
  const cat = async (slug) => (await pool.query('SELECT id FROM categories WHERE slug = ?', [slug]))[0][0].id;
  const ananya = await uid('ananya@example.com'), karthik = await uid('karthik@example.com'), sneha = await uid('sneha@example.com');

  // [owner, category slug, title, description, type, condition, price | auction{start,inc,hours}, [r,g,b]]
  const samples = [
    [ananya, 'textbooks', 'Discrete Mathematics and Its Applications (Rosen)', 'Clean copy, light pencil notes in two chapters. Great for II-year CSE.', 'sale', 'good', 450, [79, 70, 229]],
    [ananya, 'textbooks', 'Data Structures using C', 'Exchange for any Operating Systems textbook.', 'exchange', 'like_new', null, [99, 102, 241]],
    [ananya, 'study-notes', 'Software Testing handwritten notes (Sem 4)', 'Complete unit-wise notes with solved previous questions.', 'sale', 'good', 120, [129, 140, 248]],
    [karthik, 'drawing-kits', 'Engineering drawing kit with drafter', 'Mini-drafter, set squares and compass. Used for one year.', 'both', 'good', 600, [22, 163, 74]],
    [karthik, 'calculators', 'Casio fx-991EX scientific calculator', 'Works perfectly, comes with cover.', 'auction', 'like_new', { start: 500, inc: 25, hours: 72 }, [34, 197, 94]],
    [karthik, 'lab-coats', 'White lab coat (size M)', 'Washed and ironed, barely used.', 'sale', 'like_new', 200, [148, 163, 184]],
    [sneha, 'electronics', 'Arduino Uno starter kit', 'Board, breadboard, jumper wires and sensors.', 'auction', 'good', { start: 700, inc: 50, hours: 48 }, [14, 165, 233]],
    [sneha, 'lab-equipment', 'Digital multimeter', 'Auto-ranging multimeter with probes.', 'both', 'fair', 350, [245, 158, 11]],
    [sneha, 'electronics', 'Raspberry Pi 4 (4GB) with case', 'Exchange for a good laptop cooling pad.', 'exchange', 'good', null, [239, 68, 68]],
    [ananya, 'other', 'Hostel study lamp (rechargeable)', 'LED lamp, three brightness levels.', 'sale', 'good', 250, [168, 85, 247]],
  ];

  await fs.mkdir(path.join(UPLOAD_ROOT, 'items'), { recursive: true });
  for (const [owner, slug, title, desc, type, cond, price, [r, g, b]] of samples) {
    const [res] = await pool.query(
      `INSERT INTO items (owner_id, category_id, title, description, listing_type, item_condition, price, college)
       SELECT ?, ?, ?, ?, ?, ?, ?, college FROM users WHERE id = ?`,
      [owner, await cat(slug), title, desc, type, cond, typeof price === 'number' ? price : null, owner]);
    const name = `${crypto.randomUUID()}.png`;
    await fs.writeFile(path.join(UPLOAD_ROOT, 'items', name), solidPng(r, g, b));
    await pool.query('INSERT INTO item_images (item_id, image_path, sort_order) VALUES (?, ?, 0)', [res.insertId, `/uploads/items/${name}`]);
    if (type === 'auction') {
      await pool.query(
        `INSERT INTO auctions (item_id, starting_price, min_increment, current_price, starts_at, ends_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))`,
        [res.insertId, price.start, price.inc, price.start, price.hours]);
    }
  }
  console.log(`created ${samples.length} sample listings (solid-colour placeholder images)`);
}
await pool.end();
