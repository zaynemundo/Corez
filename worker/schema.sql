CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invite_codes (code TEXT PRIMARY KEY, used_by TEXT, used_at INTEGER, max_uses INTEGER DEFAULT 1, uses INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New Conversation', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, attachments TEXT, created_at INTEGER NOT NULL, FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON chat_messages(chat_id, created_at ASC);
INSERT OR IGNORE INTO invite_codes (code) VALUES ('COREZ-INVITE-2026');
