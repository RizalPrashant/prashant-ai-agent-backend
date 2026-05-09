import { Router, Request, Response } from 'express';
import { sendSummaryEmail } from '../services/email';
import { saveSummary } from '../db';

const router = Router();

// POST /email/send-summary
// Body: { conversationId, to, recruiterName?, company?, roleDiscussed?, summary }
router.post('/send-summary', async (req: Request, res: Response) => {
  const { conversationId, to, recruiterName, company, roleDiscussed, summary } = req.body as {
    conversationId?: string;
    to?: string;
    recruiterName?: string;
    company?: string;
    roleDiscussed?: string;
    summary?: string;
  };

  if (!to || !summary) {
    res.status(400).json({ error: 'to and summary are required' });
    return;
  }

  if (conversationId) {
    saveSummary(conversationId, summary);
  }

  const result = await sendSummaryEmail({ to, recruiterName, company, roleDiscussed, summary });

  if (result.success) {
    res.json({ success: true, messageId: result.messageId });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

export default router;
