import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'agent.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recruiters (
      id            TEXT PRIMARY KEY,
      name          TEXT,
      email         TEXT UNIQUE NOT NULL,
      company       TEXT,
      role_discussed TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id           TEXT PRIMARY KEY,
      recruiter_id TEXT REFERENCES recruiters(id),
      channel      TEXT NOT NULL CHECK(channel IN ('chat','voice')),
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
      vapi_call_id TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content         TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      content         TEXT NOT NULL,
      email_sent      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled_events (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id),
      recruiter_email TEXT NOT NULL,
      recruiter_name  TEXT,
      event_title     TEXT NOT NULL,
      event_description TEXT,
      start_time      TEXT NOT NULL,
      end_time        TEXT NOT NULL,
      google_event_id TEXT,
      meet_link       TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Recruiters ───────────────────────────────────────────────────────────────

export interface RecruiterRow {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  role_discussed: string | null;
  created_at: string;
}

export function upsertRecruiter(data: {
  email: string;
  name?: string;
  company?: string;
  role_discussed?: string;
}): string {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM recruiters WHERE email = ?')
    .get(data.email) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE recruiters
      SET name = COALESCE(?, name),
          company = COALESCE(?, company),
          role_discussed = COALESCE(?, role_discussed)
      WHERE id = ?
    `).run(data.name ?? null, data.company ?? null, data.role_discussed ?? null, existing.id);
    return existing.id;
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO recruiters (id, name, email, company, role_discussed)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.name ?? null, data.email, data.company ?? null, data.role_discussed ?? null);
  return id;
}

// ── Conversations ─────────────────────────────────────────────────────────────

export function createConversation(
  channel: 'chat' | 'voice',
  opts?: { recruiterId?: string; vapiCallId?: string }
): string {
  const id = uuidv4();
  getDb()
    .prepare(`
      INSERT INTO conversations (id, recruiter_id, channel, vapi_call_id)
      VALUES (?, ?, ?, ?)
    `)
    .run(id, opts?.recruiterId ?? null, channel, opts?.vapiCallId ?? null);
  return id;
}

export function getConversationByVapiCallId(vapiCallId: string): { id: string } | undefined {
  return getDb()
    .prepare('SELECT id FROM conversations WHERE vapi_call_id = ?')
    .get(vapiCallId) as { id: string } | undefined;
}

export function linkRecruiterToConversation(conversationId: string, recruiterId: string): void {
  getDb()
    .prepare(`UPDATE conversations SET recruiter_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(recruiterId, conversationId);
}

export function completeConversation(id: string): void {
  getDb()
    .prepare(`UPDATE conversations SET status = 'completed', updated_at = datetime('now') WHERE id = ?`)
    .run(id);
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface MessageRow {
  role: 'user' | 'assistant';
  content: string;
}

export function addMessage(data: {
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), data.conversation_id, data.role, data.content);
  db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`)
    .run(data.conversation_id);
}

export function getMessages(conversationId: string): MessageRow[] {
  return getDb()
    .prepare(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `)
    .all(conversationId) as MessageRow[];
}

// ── Summaries ─────────────────────────────────────────────────────────────────

export function saveSummary(conversationId: string, content: string): string {
  const id = uuidv4();
  getDb()
    .prepare('INSERT INTO summaries (id, conversation_id, content) VALUES (?, ?, ?)')
    .run(id, conversationId, content);
  return id;
}

export function markSummaryEmailSent(id: string): void {
  getDb().prepare('UPDATE summaries SET email_sent = 1 WHERE id = ?').run(id);
}

export function getRecruiterByConversationId(conversationId: string): RecruiterRow | undefined {
  return getDb()
    .prepare(`
      SELECT r.* FROM recruiters r
      JOIN conversations c ON c.recruiter_id = r.id
      WHERE c.id = ?
    `)
    .get(conversationId) as RecruiterRow | undefined;
}

// ── Scheduled Events ──────────────────────────────────────────────────────────

export function saveScheduledEvent(data: {
  conversation_id?: string;
  recruiter_email: string;
  recruiter_name?: string;
  event_title: string;
  event_description?: string;
  start_time: string;
  end_time: string;
  google_event_id?: string;
  meet_link?: string;
}): string {
  const id = uuidv4();
  getDb()
    .prepare(`
      INSERT INTO scheduled_events
        (id, conversation_id, recruiter_email, recruiter_name, event_title, event_description, start_time, end_time, google_event_id, meet_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      data.conversation_id ?? null,
      data.recruiter_email,
      data.recruiter_name ?? null,
      data.event_title,
      data.event_description ?? null,
      data.start_time,
      data.end_time,
      data.google_event_id ?? null,
      data.meet_link ?? null
    );
  return id;
}
