# Vapi Voice Integration — Setup Guide

This guide walks through creating a Vapi assistant that talks to recruiters on your behalf, sends its tool calls to your backend, and emails you a transcript when every call ends.

---

## Prerequisites

- Backend running (locally with ngrok, or deployed)
- Vapi account at [vapi.ai](https://vapi.ai)
- `OPENAI_API_KEY` set in `.env`

---

## Step 1 — Expose your local server with ngrok

Vapi needs a public HTTPS URL to send webhooks to. ngrok creates a tunnel from the internet to your local machine.

```bash
# Install ngrok (macOS)
brew install ngrok/ngrok/ngrok

# Authenticate once (get token at dashboard.ngrok.com)
ngrok config add-authtoken YOUR_NGROK_TOKEN

# In one terminal — start your backend
npm run dev

# In another terminal — start the tunnel
ngrok http 3000
```

ngrok will print something like:

```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Copy that HTTPS URL. Your webhook URL is:

```
https://abc123.ngrok-free.app/vapi/webhook
```

> For production, replace this with your deployed URL (e.g. Railway, Render, Fly.io).

---

## Step 2 — Create a Vapi assistant

1. Go to [vapi.ai](https://vapi.ai) → **Dashboard** → **Assistants** → **Create Assistant**
2. Choose **Blank** (not a template)

---

## Step 3 — Set the first message

Leave **First Message** blank — the system prompt greets by name dynamically.

---

## Step 4 — Set the system prompt

In the **Model** section, set **Provider** to `OpenAI` and **Model** to `gpt-4o`.

Paste the following into the **System Prompt** field:

```
You are Prashant's AI talent agent on a phone call. You are NOT Prashant — make this clear at the start.

VOICE RULES — follow these strictly:
- Speak in short, natural sentences. Two to three sentences per turn maximum.
- Never use bullet points, asterisks, markdown, or lists. This is spoken audio.
- Never say "As an AI" or "I am a language model". Just speak as Prashant's representative.
- If you didn't catch something, say "Sorry, could you say that again?" naturally.
- Pause naturally after asking a question — don't rush to fill silence.

PERSONALITY:
- Warm, confident, and slightly professional. Not robotic.
- Lightly funny when the moment allows. Keep it human.
- Direct. Recruiters are busy — respect their time.

ABOUT PRASHANT RIZAL:
- Completing his Master of IT at Queensland University of Technology, graduating June 2026. He also holds a Bachelor of Science in Computer Science from Boise State University.
- Around four years of professional software engineering experience in the United States, across Android engineering and full-stack web development.
- Based in Brisbane, Queensland, Australia.
- Available from June 2026. Open to conversations now — part-time or casual is possible for the right fit.
- Has post-study work rights in Australia from June 2026.
- Holds two Microsoft Azure certifications: AZ-900 Cloud Fundamentals and DP-900 Data Fundamentals, both from October 2024.

PROFESSIONAL EXPERIENCE:
- Currently building an AI-powered internal chatbot for the Queensland Government Department of Natural Resources and Mines as his industry capstone. It helps land officers query legislation and workflows in plain English. Stack is React, Supabase, n8n, OpenAI, and Tesseract OCR. He runs weekly stakeholder meetings with government clients.
- Previously worked as an Android Engineer at Hestan Smart Cooking in Seattle, where he integrated Bluetooth Low Energy to connect their app with smart cookware and cooktops. He set up their CI/CD pipeline using Bitrise and built shared services using Apache Thrift.
- Before that, he was a contractor at Predictable Ryde in Boise, a school bus tracking startup. He built NFC ID scanners, QR code scanners, Firebase push notifications, and AWS DynamoDB integrations across Android, iOS, and web.

PROJECTS:
- Built NearPrep, an AI interview prep platform at nearprep.com. It uses React, TypeScript, Supabase, Gemini API, Clerk for auth, and Stripe for payments. He also deployed an n8n RAG agent on AWS EC2.
- Built Ctrl plus ADHD, an AI productivity and workflow tool specifically for neurodiverse users.
- Built a Pythagorean Calculator Android app in 2017 that got over 40,000 downloads.

SKILLS:
- Java, JavaScript, TypeScript, Python, Kotlin, Swift for iOS.
- Web: React, Next.js, Node.js, Express, React Native, Angular.
- Native Android is his strongest mobile platform. He also has iOS and React Native experience.
- AI: OpenAI API, Gemini API, RAG pipelines, n8n, vector databases, LangChain.
- Cloud: AWS with EC2, DynamoDB, and Elastic Beanstalk. Azure certified.
- Databases: PostgreSQL, Supabase, MySQL, SQLite, DynamoDB.
- Tools: Docker, Git, Spring Boot, Apache Thrift, Bitrise, Firebase.

TARGET ROLES in priority order: AI product builder or AI engineer, full-stack engineer, Android or mobile engineer, software engineer.

PREFERENCES: Brisbane is the preference but open to remote Australia-based roles and relocation for the right opportunity. Market rate compensation. Start date June 2026, flexible for a great fit.

RECRUITER INFO (collected before the call):
- Name: {{recruiterName}}
- Company: {{recruiterCompany}}
- Email: {{recruiterEmail}}

CONVERSATION FLOW:
Step one: Greet them by name. "Hi {{recruiterName}}, I'm Prashant's AI talent agent. He asked me to handle initial recruiter calls while he finishes his degree. What role are you looking to fill?"
Step two: Answer their questions naturally and concisely. Assess fit honestly — don't oversell.
Step three: When the conversation winds down, ask: "Before we wrap up — would you like me to email you a summary of our chat?"
Step four: If yes, call send_conversation_summary with recruiter_email set to {{recruiterEmail}} and a professional summary you generate yourself.
Step five: Ask: "Would you also like to schedule a quick intro call directly with Prashant?"
Step six: If yes, use check_availability to find a free slot, confirm the time with them, then use create_event to book it.

CRITICAL RULES:
- Never claim to be Prashant.
- Never ask for their name, company, or email — you already have it.
- If you don't know something specific, say: "I don't have that detail on me right now, but I'll make sure Prashant follows up with you."
- Be honest about fit based on the profile above.
```

---

## Step 5 — Connect the webhook

In the assistant editor, go to **Advanced** → **Server URL** (sometimes labelled **Webhook URL**) and paste:

```
https://abc123.ngrok-free.app/vapi/webhook
```

This single URL handles all events: `assistant-request`, `function-call`, and `end-of-call-report`.

> Alternatively, set a global webhook in **Dashboard → Settings → Webhooks** — it applies to all assistants.

---

## Step 6 — Add the three custom tools

In the assistant editor, go to **Functions** (or **Tools**) → **Add Function** for each one below.

### Tool 1: collect_recruiter_info

| Field       | Value                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Name        | `collect_recruiter_info`                                                                         |
| Description | `Save recruiter contact details — call this as soon as you learn their name, company, or email.` |

Parameters (paste as JSON):

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Recruiter's full name" },
    "email": { "type": "string", "description": "Recruiter's email address" },
    "company": {
      "type": "string",
      "description": "Recruiter's company or agency"
    },
    "role_discussed": {
      "type": "string",
      "description": "Role or position being discussed"
    }
  },
  "required": ["email"]
}
```

### Tool 2: send_conversation_summary

| Field       | Value                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Name        | `send_conversation_summary`                                                                                                 |
| Description | `Send a conversation summary email to the recruiter and Prashant. Only call this after the recruiter agrees to receive it.` |

Parameters:

```json
{
  "type": "object",
  "properties": {
    "recruiter_email": { "type": "string" },
    "recruiter_name": { "type": "string" },
    "company": { "type": "string" },
    "role_discussed": { "type": "string" },
    "summary": {
      "type": "string",
      "description": "Professional summary of the conversation: role discussed, key questions, fit assessment, and next steps"
    }
  },
  "required": ["recruiter_email", "summary"]
}
```

### Tool 3: schedule_meeting

| Field       | Value                                                                                 |
| ----------- | ------------------------------------------------------------------------------------- |
| Name        | `schedule_meeting`                                                                    |
| Description | `Schedule a follow-up meeting on Google Calendar between the recruiter and Prashant.` |

Parameters:

```json
{
  "type": "object",
  "properties": {
    "recruiter_email": { "type": "string" },
    "recruiter_name": { "type": "string" },
    "proposed_time": {
      "type": "string",
      "description": "ISO 8601 datetime, e.g. 2026-06-15T10:00:00+10:00"
    },
    "duration_minutes": {
      "type": "number",
      "description": "Duration in minutes, default 30"
    },
    "meeting_topic": { "type": "string" }
  },
  "required": ["recruiter_email", "proposed_time"]
}
```

---

## Step 7 — Set the voice

In the **Voice** section:

- Provider: `11Labs`
- Voice: `Adam` (voiceId: `pNInz6obpgDQGcFmaJgB`) — calm, professional, neutral accent

You can preview voices in the Vapi dashboard before committing.

---

## Step 8 — Test a full call locally

### Option A — Web call from Vapi dashboard

1. Open your assistant in the Vapi dashboard
2. Click **Test** (phone icon, top right)
3. Talk to it — introduce yourself as a recruiter
4. Watch your terminal for incoming webhook logs

### Option B — curl the webhook directly

Test `function-call` handling without a real call:

```bash
# Test collect_recruiter_info
curl -X POST http://localhost:3000/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "function-call",
      "call": { "id": "test-call-001" },
      "functionCall": {
        "name": "collect_recruiter_info",
        "parameters": {
          "name": "Sarah Chen",
          "email": "sarah@canva.com",
          "company": "Canva",
          "role_discussed": "Full-Stack Engineer"
        }
      }
    }
  }'

# Test end-of-call-report (triggers email to Prashant)
curl -X POST http://localhost:3000/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": { "id": "test-call-001" },
      "endedReason": "customer-ended-call",
      "summary": "Recruiter from Canva discussed a full-stack role. Prashant is a strong fit. Recruiter agreed to email summary.",
      "transcript": "Agent: Hi, I am Prashant'\''s AI talent agent...\nRecruiter: Hi, I'\''m recruiting for a full-stack role at Canva..."
    }
  }'
```

After the second curl, check `prizal.np@gmail.com` for the call notification email.

---

## What happens on a real call

| Event                              | What Vapi sends                            | What your server does                                       |
| ---------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Call starts                        | `assistant-request`                        | Returns assistant config (system prompt, voice, tools)      |
| Agent wants to save recruiter info | `function-call: collect_recruiter_info`    | Saves to SQLite, links to conversation                      |
| Recruiter agrees to summary        | `function-call: send_conversation_summary` | Sends email to recruiter + Prashant                         |
| Recruiter wants to schedule        | `function-call: schedule_meeting`          | Creates Google Calendar event                               |
| Call ends                          | `end-of-call-report`                       | Saves transcript to DB, emails Prashant the full transcript |

---

## Payload field reference

### `function-call`

```json
{
  "message": {
    "type": "function-call",
    "call": { "id": "call_xxx" },
    "functionCall": {
      "name": "tool_name",
      "parameters": { "...": "..." }
    }
  }
}
```

Your server returns: `{ "result": "<string>" }`

### `end-of-call-report`

```json
{
  "message": {
    "type": "end-of-call-report",
    "call": { "id": "call_xxx" },
    "endedReason": "customer-ended-call",
    "summary": "AI-generated summary of the call",
    "transcript": "Full turn-by-turn transcript",
    "recordingUrl": "https://...",
    "messages": [{ "role": "assistant", "content": "..." }]
  }
}
```

---

## Production checklist

- [ ] Deploy backend (Railway recommended — see README)
- [ ] Replace ngrok URL with production URL in Vapi dashboard
- [ ] Set a static ngrok domain (paid plan) or use a deployed URL — free ngrok URLs change on restart
- [ ] Enable call recording in Vapi for your own records
- [ ] Add `VAPI_WEBHOOK_SECRET` to `.env` and verify the `x-vapi-secret` header for security
