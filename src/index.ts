import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { getDb } from './db';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logger (dev-friendly)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/', routes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ───────────────────────────────────────────────────────────────────
function start() {
  // Initialise DB (runs migrations)
  getDb();
  console.log('[db] SQLite ready');

  app.listen(PORT, () => {
    console.log(`\n🤖 Prashant's AI Talent Agent — listening on http://localhost:${PORT}`);
    console.log(`   GET  /health`);
    console.log(`   POST /chat/message`);
    console.log(`   POST /vapi/webhook`);
    console.log(`   POST /email/send-summary`);
    console.log(`   POST /calendar/schedule`);
    console.log(`   POST /whatsapp/notify\n`);
  });
}

start();
