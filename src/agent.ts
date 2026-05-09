import OpenAI from 'openai';
import {
  addMessage,
  getMessages,
  upsertRecruiter,
  linkRecruiterToConversation,
  saveSummary,
} from './db';
import { sendSummaryEmail } from './services/email';
import { scheduleCalendarEvent } from './services/calendar';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set — chat route unavailable');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ── Prashant's profile ─────────────────────────────────────────────────────

const PROFILE = `
ABOUT PRASHANT RIZAL:
- Master of IT (Software Engineering) at Queensland University of Technology — graduating June 2026
- Bachelor of Science in Computer Science, Boise State University (2015–2019)
- ~4 years professional software engineering experience across the US (Idaho and Seattle)
- Based in Brisbane, Queensland, Australia
- Available: June 2026 (open to conversations now; part-time/casual possible for the right fit)
- Right to work: post-study work rights from June 2026

CERTIFICATIONS:
- Microsoft Azure Cloud Fundamentals (AZ-900) — October 2024
- Microsoft Azure Data Fundamentals (DP-900) — October 2024

PROFESSIONAL EXPERIENCE:

1. QLD Government AI Chatbot — Industry Capstone (July 2025 – June 2026, Brisbane)
   - Built an AI-powered internal chatbot for the Department of Natural Resources and Mines
   - Used by Queensland Government land officers to query legislation, workflows, and internal templates
   - Stack: React, Supabase, n8n orchestration, OpenAI APIs, Tesseract OCR
   - Implemented multi-document reasoning and reranking pipelines for complex legislative queries
   - Ran weekly stakeholder meetings with government clients — requirements, iteration, demos

2. Android Engineer — Hestan Smart Cooking (Feb 2021 – Dec 2022, Seattle, WA)
   - Integrated Bluetooth Low Energy (BLE) to connect the Android app with smart cookware and cooktops
   - Set up CI/CD pipeline using Bitrise
   - Built and maintained CRUD services using Apache Thrift (shared with iOS team)
   - Diagnosed and fixed production crashes via Mopinion user logs
   - Stack: Android Core Library, Dagger, RxJava, Robolectric, Mockito

3. Application and Web Developer — Predictable Ryde (April 2019 – March 2020, Boise, ID)
   - Contractor at a school bus tracking startup — shipped features across Android, iOS, and web
   - Built NFC ID scanner (Mifare Classic and Ultralight tags) and QR code scanner
   - Implemented Firebase push notifications across Android, iOS, and Node.js
   - Built bus route service using AWS DynamoDB; deployed stack on AWS Elastic Beanstalk
   - Wrote automated tests using Selenium

PROJECTS:

1. NearPrep (2025) — nearprep.com
   - AI interview prep platform with last-minute interview simulation and personalised feedback
   - Stack: React, TypeScript, Supabase (PostgreSQL), Gemini API, Clerk (auth), Stripe (payments)
   - Deployed n8n RAG agent on AWS EC2 via Docker

2. Ctrl + ADHD — AI productivity tool for neurodiverse users
   - AI workflow tool designed to reduce cognitive overhead for people with ADHD

3. Pythagorean Calculator Android App (2017)
   - 40,000+ downloads — student maths validation tool
   - github.com/RizalPrashant/pythagorean-calculator

SKILLS:
- Languages: Java, JavaScript/TypeScript, Python, Kotlin, Swift (iOS), C, PHP
- Web: React, React Native, Next.js, Node.js, Express, Angular
- Mobile: Native Android (primary), iOS (Swift), React Native
- AI/ML: OpenAI API, Gemini API, RAG, embeddings, vector DBs, n8n, LangChain
- Cloud: AWS (EC2, DynamoDB, Elastic Beanstalk), Azure (AZ-900 + DP-900 certified)
- Databases: PostgreSQL/Supabase, MySQL, SQLite, DynamoDB
- Tools: Docker, Git, Spring/Spring Boot, Apache Thrift, Bitrise, Firebase
- Testing: JUnit, TestNG, Robolectric, Mockito, Selenium
- Process: Agile, Scrum, Waterfall

TARGET ROLES (priority order):
1. AI Product Builder / AI Engineer
2. Full-Stack Engineer
3. Android / Mobile Engineer
4. Software Engineer (general)

PREFERENCES:
- Location: Brisbane (primary); open to remote Australia-based; open to relocation for exceptional opportunities
- Compensation: market rate for Brisbane (happy to discuss)
- Start date: June 2026 (flexible for the right role)
`;

// ── System prompt ──────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are Prashant's AI talent agent. You are NOT Prashant — always be clear about this when it matters.

IDENTITY: You speak on Prashant's behalf to recruiters. Think of yourself as his sharp, friendly spokesperson.

PERSONALITY:
- Concise (recruiters are busy — one paragraph max unless they ask for detail)
- Confident and direct
- Warm and slightly funny — not cringe, just human
- Honest about fit (don't oversell)

RULES:
1. Never pretend to be Prashant. You are his AI agent.
2. Keep responses short. Expand only when asked.
3. If you don't know something specific: "Good question — I don't have that detail on me, but I'll make sure Prashant follows up."
4. Assess role fit honestly based on the profile below.
5. Suggest next steps proactively.

${PROFILE}

CONVERSATION FLOW:
Step 1: Greet and introduce yourself. Ask what role they're hiring for.
Step 2: Answer questions about Prashant's background, projects, skills, and fit.
Step 3: After a natural lull (typically 4–8 exchanges), offer a summary:
  "Want me to email you a summary of what we covered? I'll copy Prashant too — takes two seconds."
Step 4: If yes → collect their email if you don't have it → call send_conversation_summary.
Step 5: Offer to schedule a follow-up call if the conversation is going well.

TOOL GUIDANCE:
- Call collect_recruiter_info as soon as you learn their name, company, or email.
- Call send_conversation_summary only after the recruiter agrees; generate a professional summary yourself.
- Call schedule_meeting when they indicate interest in speaking with Prashant directly.

OPENING LINE:
"Hi! I'm Prashant's AI talent agent — he's wrapping up his Master of IT at QUT and available from June 2026. What role are you looking to fill?"`;

// ── Tools ──────────────────────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'collect_recruiter_info',
      description: 'Save recruiter contact details to the database',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "Recruiter's full name" },
          email: { type: 'string', description: "Recruiter's email address" },
          company: { type: 'string', description: "Recruiter's company or agency" },
          role_discussed: { type: 'string', description: 'Role or position being discussed' },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_conversation_summary',
      description:
        'Send a professional conversation summary by email to the recruiter and Prashant. Call this only after the recruiter agrees.',
      parameters: {
        type: 'object',
        properties: {
          recruiter_email: { type: 'string' },
          recruiter_name: { type: 'string' },
          company: { type: 'string' },
          role_discussed: { type: 'string' },
          summary: {
            type: 'string',
            description:
              'Professional markdown-formatted summary covering: role discussed, key questions asked, fit assessment, and suggested next steps',
          },
        },
        required: ['recruiter_email', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_meeting',
      description: 'Schedule a follow-up meeting on Google Calendar and invite both parties',
      parameters: {
        type: 'object',
        properties: {
          recruiter_email: { type: 'string' },
          recruiter_name: { type: 'string' },
          proposed_time: {
            type: 'string',
            description: 'ISO 8601 datetime string, e.g. 2026-06-15T10:00:00+10:00',
          },
          duration_minutes: { type: 'number', description: 'Duration in minutes, default 30' },
          meeting_topic: { type: 'string', description: 'Purpose of the meeting' },
        },
        required: ['recruiter_email', 'proposed_time'],
      },
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  conversationId: string,
  actions: string[]
): Promise<ToolResult> {
  try {
    if (name === 'collect_recruiter_info') {
      const recruiterId = upsertRecruiter({
        email: args.email as string,
        name: args.name as string | undefined,
        company: args.company as string | undefined,
        role_discussed: args.role_discussed as string | undefined,
      });
      linkRecruiterToConversation(conversationId, recruiterId);
      actions.push(`Recruiter saved: ${args.email}`);
      return { success: true, data: { recruiter_id: recruiterId } };
    }

    if (name === 'send_conversation_summary') {
      const summaryId = saveSummary(conversationId, args.summary as string);

      const emailResult = await sendSummaryEmail({
        to: args.recruiter_email as string,
        recruiterName: args.recruiter_name as string | undefined,
        company: args.company as string | undefined,
        roleDiscussed: args.role_discussed as string | undefined,
        summary: args.summary as string,
      });
      if (emailResult.success) actions.push(`Summary email sent to ${args.recruiter_email}`);
      else actions.push(`Email failed: ${emailResult.error}`);

      return { success: true, data: { summary_id: summaryId } };
    }

    if (name === 'schedule_meeting') {
      const event = await scheduleCalendarEvent({
        recruiterEmail: args.recruiter_email as string,
        recruiterName: args.recruiter_name as string | undefined,
        proposedTime: args.proposed_time as string,
        durationMinutes: (args.duration_minutes as number) ?? 30,
        meetingTopic: args.meeting_topic as string | undefined,
        conversationId,
      });
      if (event.success) actions.push(`Meeting scheduled: ${event.meetLink ?? 'no link'}`);
      else actions.push(`Calendar scheduling failed: ${event.error}`);
      return event;
    }

    return { success: false, error: `Unknown tool: ${name}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Tool ${name} threw:`, msg);
    return { success: false, error: msg };
  }
}

// ── Agent entry point ──────────────────────────────────────────────────────

export interface AgentResponse {
  message: string;
  actions: string[];
  conversationId: string;
}

export async function processMessage(
  conversationId: string,
  userMessage: string
): Promise<AgentResponse> {
  addMessage({ conversation_id: conversationId, role: 'user', content: userMessage });

  const history = getMessages(conversationId);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions: string[] = [];
  let finalMessage = '';

  // Agentic loop — resolves all tool calls within a single HTTP request
  while (true) {
    const response = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 800,
    });

    const choice = response.choices[0];
    const msg = choice.message;

    if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length) {
      // Push assistant message (with tool_calls) into in-memory context
      messages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });

      for (const tc of msg.tool_calls) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // ignore parse errors, tool will handle gracefully
        }

        const result = await executeTool(tc.function.name, parsed, conversationId, actions);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      finalMessage = msg.content ?? '';
      addMessage({ conversation_id: conversationId, role: 'assistant', content: finalMessage });
      break;
    }
  }

  return { message: finalMessage, actions, conversationId };
}

// ── Voice-specific system prompt ──────────────────────────────────────────
// Separate from the chat prompt: shorter sentences, no markdown, spoken-word friendly.

export const VAPI_SYSTEM_PROMPT = `You are Prashant's AI talent agent on a phone call. You are NOT Prashant — make this clear at the start.

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

CONVERSATION FLOW:
Step one: Introduce yourself. Say something like: "Hi, I'm Prashant's AI talent agent. He asked me to handle initial recruiter calls while he finishes his degree. What role are you looking to fill?"
Step two: Answer their questions naturally and concisely. Assess fit honestly — don't oversell.
Step three: When the conversation winds down, say: "Before we wrap up, would you like me to email you a summary of our chat? If yes, a form will appear on your screen when we hang up — just enter your email there and I'll send it straight over."
Step four: If yes, wrap up warmly. Do NOT ask for their email verbally — the UI form handles that.
Step five: Optionally offer scheduling: "Would you also like me to set up a quick call directly with Prashant?"

CRITICAL RULES:
- Never claim to be Prashant.
- Always collect their email before calling send_conversation_summary.
- If you don't know something specific, say: "I don't have that detail on me right now, but I'll make sure Prashant follows up with you."
- Be honest about fit based on the profile above.`;

// ── Vapi assistant config ──────────────────────────────────────────────────

export function getVapiAssistantConfig() {
  return {
    firstMessage:
      "Hi, I'm Prashant's AI talent agent. He asked me to handle initial recruiter calls while he wraps up his Master of IT at QUT. What role are you looking to fill?",
    model: {
      provider: 'openai',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: [{ role: 'system', content: VAPI_SYSTEM_PROMPT }],
      tools: TOOLS,
      temperature: 0.7,
    },
    voice: {
      provider: '11labs',
      voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam — calm, professional
    },
    recordingEnabled: true,
    endCallFunctionEnabled: false,
  };
}
