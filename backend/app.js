import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Behind Nginx / a load balancer, set TRUST_PROXY=1 so rate limiting sees each visitor's real IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // allow images from the Vite origin
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Uploaded images are served as static files only; nothing in here is ever executed.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { index: false, dotfiles: 'deny' }));

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
