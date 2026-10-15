import 'dotenv/config';
import app from './app.js';
import { testConnection } from './config/db.js';
import { finalizeDue } from './services/auctionService.js';

const PORT = Number(process.env.PORT || 5000);

try {
  await testConnection();
  console.log('MySQL connected');
} catch (err) {
  console.error('Could not connect to MySQL. Check DB_* values in .env and that schema.sql was imported.');
  console.error(err.message);
  process.exit(1);
}

const server = app.listen(PORT, () => console.log(`EduSwap API running on http://localhost:${PORT}`));

// Closes auctions whose time is up (winner -> transaction + notifications). Item pages also close due auctions on demand.
const timer = setInterval(() => {
  finalizeDue().catch((err) => console.error('Auction closer failed:', err.message));
}, 30 * 1000);
timer.unref();

process.on('SIGTERM', () => server.close(() => process.exit(0)));
