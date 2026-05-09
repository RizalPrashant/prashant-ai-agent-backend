import { Router, Request, Response } from 'express';
import { createConversation } from '../db';
import { processMessage } from '../agent';

const router = Router();

// POST /chat/message
// Body: { conversationId?: string, message: string }
router.post('/message', async (req: Request, res: Response) => {
  const { conversationId, message } = req.body as {
    conversationId?: string;
    message?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const convId = conversationId ?? createConversation('chat');

  try {
    const result = await processMessage(convId, message.trim());
    res.json(result);
  } catch (err) {
    console.error('[chat] processMessage error:', err);
    res.status(500).json({ error: 'Agent error — please try again' });
  }
});

export default router;
