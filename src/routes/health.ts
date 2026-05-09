import { Router } from 'express';
import { getDb } from '../db';

const router = Router();

router.get('/', (_req, res) => {
  let dbOk = false;
  try {
    getDb().prepare('SELECT 1').get();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? 'ok' : 'error',
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'not configured',
      email: process.env.SMTP_USER ? 'configured' : 'not configured',
      whatsapp: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configured' : 'not configured',
      googleCalendar: process.env.GOOGLE_CLIENT_EMAIL ? 'configured' : 'not configured',
    },
  });
});

export default router;
