import { Router, Request, Response } from 'express';
import {
  createConversation,
  getConversationByVapiCallId,
  getRecruiterByConversationId,
  completeConversation,
  addMessage,
  saveSummary,
} from '../db';
import { executeTool, getVapiAssistantConfig } from '../agent';
import { sendCallNotificationToPrashant } from '../services/email';

const router = Router();

// Vapi sends all events to POST /vapi/webhook
router.post('/webhook', async (req: Request, res: Response) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { message } = req.body as { message: Record<string, any> };

  if (!message?.type) {
    res.status(400).json({ error: 'Invalid Vapi payload' });
    return;
  }

  switch (message.type as string) {
    // ── 1. Assistant configuration request ──────────────────────────────────
    // Vapi calls this when a new call starts and no assistantId is set on the phone number.
    // Returns full assistant config — system prompt, model, voice, tools.
    case 'assistant-request': {
      res.json({ assistant: getVapiAssistantConfig() });
      return;
    }

    // ── 2. Tool/function call from the voice assistant ───────────────────────
    // Fired whenever the LLM decides to call one of our custom tools.
    // Vapi pauses speech, waits for our result, then continues the conversation.
    case 'function-call': {
      const callId: string = message.call?.id ?? 'unknown';

      // Vapi payload: message.functionCall = { name, parameters }
      const fnCall = message.functionCall as {
        name: string;
        parameters: Record<string, unknown>;
      };

      // Ensure a conversation row exists for this Vapi call
      let conv = getConversationByVapiCallId(callId);
      if (!conv) {
        const convId = createConversation('voice', { vapiCallId: callId });
        conv = { id: convId };
      }

      const actions: string[] = [];
      const result = await executeTool(fnCall.name, fnCall.parameters ?? {}, conv.id, actions);

      // Vapi requires the result as a plain string
      res.json({ result: JSON.stringify(result) });
      return;
    }

    // ── 3. End-of-call report ────────────────────────────────────────────────
    // Fired when the call ends. Contains summary, full transcript, ended reason.
    // We save everything and email Prashant a notification.
    case 'end-of-call-report': {
      const callId: string = message.call?.id ?? 'unknown';
      const summary: string = message.summary ?? '';
      const transcript: string = message.transcript ?? '';
      const endedReason: string = message.endedReason ?? '';

      let conv = getConversationByVapiCallId(callId);
      if (!conv) {
        const convId = createConversation('voice', { vapiCallId: callId });
        conv = { id: convId };
      }

      // Persist transcript and summary
      if (transcript) {
        addMessage({
          conversation_id: conv.id,
          role: 'user',
          content: `[Voice Transcript]\n${transcript}`,
        });
      }
      if (summary) {
        saveSummary(conv.id, summary);
      }

      completeConversation(conv.id);

      // Look up recruiter info collected during the call (via collect_recruiter_info tool)
      const recruiter = getRecruiterByConversationId(conv.id);

      // Always email Prashant when a voice call ends
      await sendCallNotificationToPrashant({
        summary,
        transcript,
        endedReason,
        recruiterName: recruiter?.name ?? undefined,
        recruiterEmail: recruiter?.email ?? undefined,
        company: recruiter?.company ?? undefined,
      }).catch((err) => console.error('[vapi] end-of-call email failed:', err));

      res.json({ received: true });
      return;
    }

    // ── 4. All other Vapi events — just acknowledge ──────────────────────────
    // Includes: status-update, speech-update, transcript, hang
    default:
      res.json({ received: true });
  }
});

export default router;
