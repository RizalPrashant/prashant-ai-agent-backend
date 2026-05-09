import { google } from 'googleapis';
import { saveScheduledEvent } from '../db';
import { sendSummaryEmail } from './email';

export interface CalendarResult {
  success: boolean;
  eventId?: string;
  meetLink?: string;
  htmlLink?: string;
  error?: string;
}

export async function scheduleCalendarEvent(opts: {
  recruiterEmail: string;
  recruiterName?: string;
  proposedTime: string;
  durationMinutes?: number;
  meetingTopic?: string;
  conversationId?: string;
}): Promise<CalendarResult> {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
  const prashantEmail = process.env.PRASHANT_EMAIL;

  if (!clientEmail || !privateKey) {
    console.warn('[calendar] Google credentials not configured — skipping');
    return { success: false, error: 'Google Calendar not configured' };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const startDt = new Date(opts.proposedTime);
    const endDt = new Date(startDt.getTime() + (opts.durationMinutes ?? 30) * 60_000);
    const topic = opts.meetingTopic ?? 'Introductory Call — Prashant Rizal';

    const event = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: topic,
        description: `Scheduled via Prashant's AI Talent Agent.\n\nRecruiter: ${opts.recruiterName ?? opts.recruiterEmail}`,
        start: { dateTime: startDt.toISOString(), timeZone: 'Australia/Brisbane' },
        end: { dateTime: endDt.toISOString(), timeZone: 'Australia/Brisbane' },
        attendees: prashantEmail ? [{ email: prashantEmail }] : [],
        conferenceData: {
          createRequest: { requestId: `prashant-agent-${Date.now()}` },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
      },
    });

    const meetLink =
      (event.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri) ??
      undefined;

    saveScheduledEvent({
      conversation_id: opts.conversationId,
      recruiter_email: opts.recruiterEmail,
      recruiter_name: opts.recruiterName,
      event_title: topic,
      start_time: startDt.toISOString(),
      end_time: endDt.toISOString(),
      google_event_id: event.data.id ?? undefined,
      meet_link: meetLink,
    });

    // Email the recruiter the Meet link since service accounts can't add external attendees
    if (meetLink) {
      const dateStr = startDt.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'full', timeStyle: 'short' });
      await sendSummaryEmail({
        to: opts.recruiterEmail,
        recruiterName: opts.recruiterName,
        summary: `A meeting has been scheduled with Prashant Rizal.\n\nTopic: ${topic}\nDate: ${dateStr} (Brisbane time)\nDuration: ${opts.durationMinutes ?? 30} minutes\n\nGoogle Meet link: ${meetLink}`,
      });
    }

    return {
      success: true,
      eventId: event.data.id ?? undefined,
      meetLink,
      htmlLink: event.data.htmlLink ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[calendar] scheduling failed:', msg);
    return { success: false, error: msg };
  }
}
