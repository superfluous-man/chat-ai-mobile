import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const NEW_CHAT_TITLE = "New chat";

function timestamp() {
  return new Date().toISOString();
}

function generatedTitle(content) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return NEW_CHAT_TITLE;
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

export function openDatabase(databasePath) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS messages_conversation_timestamp
      ON messages(conversation_id, timestamp);
  `);

  const statements = {
    createConversation: sqlite.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (@id, @title, @created_at, @updated_at)
    `),
    deleteConversation: sqlite.prepare("DELETE FROM conversations WHERE id = ?"),
    getConversation: sqlite.prepare(`
      SELECT id, title, created_at, updated_at
      FROM conversations WHERE id = ?
    `),
    getMessages: sqlite.prepare(`
      SELECT role, content, timestamp
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC, rowid ASC
    `),
    insertMessage: sqlite.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, timestamp)
      VALUES (@id, @conversation_id, @role, @content, @timestamp)
    `),
    listConversations: sqlite.prepare(`
      SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) AS message_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.created_at DESC
    `),
    touchConversation: sqlite.prepare(`
      UPDATE conversations SET updated_at = ? WHERE id = ?
    `),
    updateTitle: sqlite.prepare(`
      UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
    `),
  };

  const addMessageTransaction = sqlite.transaction((conversationId, role, content) => {
    const conversation = statements.getConversation.get(conversationId);
    if (!conversation) return null;

    const createdAt = timestamp();
    const message = {
      id: randomUUID(),
      conversation_id: conversationId,
      role,
      content,
      timestamp: createdAt,
    };
    statements.insertMessage.run(message);

    if (role === "user" && conversation.title === NEW_CHAT_TITLE) {
      statements.updateTitle.run(generatedTitle(content), createdAt, conversationId);
    } else {
      statements.touchConversation.run(createdAt, conversationId);
    }

    return { role, content, timestamp: createdAt };
  });

  return {
    close() {
      sqlite.close();
    },

    createConversation(title = NEW_CHAT_TITLE) {
      const createdAt = timestamp();
      const conversation = {
        id: randomUUID(),
        title,
        created_at: createdAt,
        updated_at: createdAt,
      };
      statements.createConversation.run(conversation);
      return conversation;
    },

    deleteConversation(id) {
      return statements.deleteConversation.run(id).changes > 0;
    },

    getConversation(id) {
      const conversation = statements.getConversation.get(id);
      if (!conversation) return null;
      return { ...conversation, messages: statements.getMessages.all(id) };
    },

    listConversations() {
      return statements.listConversations.all();
    },

    addMessage(conversationId, role, content) {
      return addMessageTransaction(conversationId, role, content);
    },

    updateTitle(id, title) {
      const updatedAt = timestamp();
      const result = statements.updateTitle.run(title, updatedAt, id);
      return result.changes > 0 ? statements.getConversation.get(id) : null;
    },

    exportAll() {
      return statements.listConversations.all().map(({ message_count, ...conversation }) => ({
        ...conversation,
        messages: statements.getMessages.all(conversation.id),
      }));
    },
  };
}
