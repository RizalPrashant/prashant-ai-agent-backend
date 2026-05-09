import { Router, Request, Response } from 'express';
import { scheduleCalendarEvent } from '../services/calendar';

const router = Router();

// POST /calendar/schedule
// Body: { recruiterEmail, recruiterName?, proposedTime (ISO 8601), durationMinutes?, meetingTopic?, conversationId? }
router.post('/schedule', async (req: Request, res: Response) => {
  const { recruiterEmail, recruiterName, proposedTime, durationMinutes, meetingTopic, conversationId } =
    req.body as {
      recruiterEmail?: string;
      recruiterName?: string;
      proposedTime?: string;
      durationMinutes?: number;
      meetingTopic?: string;
      conversationId?: string;
    };

  if (!recruiterEmail || !proposedTime) {
    res.status(400).json({ error: 'recruiterEmail and proposedTime are required' });
    return;
  }

  const result = await scheduleCalendarEvent({
    recruiterEmail,
    recruiterName,
    proposedTime,
    durationMinutes,
    meetingTopic,
    conversationId,
  });

  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

export default router;
