import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import {
  clearSessionCookie,
  createSessionToken,
  passwordMatches,
  readSessionCookie,
  setSessionCookie,
  verifySessionToken,
} from "./auth.js";
import { renderMarkdown } from "./markdown.js";

export const SYSTEM_PROMPT = "You are my personal assistant. I like you to be witty and have a personality. Don't lie to me.";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, "..", "public");

function presentConversation(conversation) {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => message.role === "assistant"
      ? { ...message, rendered_content: renderMarkdown(message.content) }
      : message),
  };
}

function securityHeaders(_request, response, next) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  next();
}

function createLoginLimiter() {
  const attempts = new Map();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;

  return {
    blocked(key) {
      const record = attempts.get(key);
      if (!record || Date.now() - record.startedAt > windowMs) {
        attempts.delete(key);
        return false;
      }
      return record.count >= maxAttempts;
    },
    fail(key) {
      const record = attempts.get(key);
      if (!record || Date.now() - record.startedAt > windowMs) {
        attempts.set(key, { count: 1, startedAt: Date.now() });
      } else {
        record.count += 1;
      }
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}

export function createApp({ config, database, openai }) {
  const app = express();
  const loginLimiter = createLoginLimiter();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_request, response) => response.json({ ok: true }));

  app.post("/api/login", (request, response) => {
    const key = request.ip || "unknown";
    if (loginLimiter.blocked(key)) {
      return response.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    }

    if (!passwordMatches(request.body?.password, config.appPassword)) {
      loginLimiter.fail(key);
      return response.status(401).json({ error: "Incorrect password." });
    }

    loginLimiter.reset(key);
    const remember = request.body?.remember !== false;
    const token = createSessionToken(config.sessionSecret, remember);
    setSessionCookie(response, token, { isProduction: config.isProduction, remember });
    return response.json({ authenticated: true });
  });

  app.post("/api/logout", (_request, response) => {
    clearSessionCookie(response, config.isProduction);
    response.status(204).end();
  });

  app.use("/api", (request, response, next) => {
    const token = readSessionCookie(request);
    if (!verifySessionToken(token, config.sessionSecret)) {
      return response.status(401).json({ error: "Authentication required." });
    }
    next();
  });

  app.get("/api/session", (_request, response) => {
    response.json({ authenticated: true });
  });

  app.get("/api/conversations", (_request, response) => {
    response.json({ conversations: database.listConversations() });
  });

  app.post("/api/conversations", (request, response) => {
    const requestedTitle = typeof request.body?.title === "string" ? request.body.title.trim() : "";
    const title = requestedTitle ? requestedTitle.slice(0, 120) : undefined;
    response.status(201).json({ conversation: database.createConversation(title) });
  });

  app.get("/api/conversations/:id", (request, response) => {
    const conversation = database.getConversation(request.params.id);
    if (!conversation) return response.status(404).json({ error: "Conversation not found." });
    return response.json({ conversation: presentConversation(conversation) });
  });

  app.patch("/api/conversations/:id", (request, response) => {
    const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
    if (!title) return response.status(400).json({ error: "A title is required." });
    const conversation = database.updateTitle(request.params.id, title.slice(0, 120));
    if (!conversation) return response.status(404).json({ error: "Conversation not found." });
    return response.json({ conversation });
  });

  app.delete("/api/conversations/:id", (request, response) => {
    if (!database.deleteConversation(request.params.id)) {
      return response.status(404).json({ error: "Conversation not found." });
    }
    return response.status(204).end();
  });

  app.post("/api/conversations/:id/messages", async (request, response) => {
    const content = typeof request.body?.content === "string" ? request.body.content : "";
    if (!content.trim()) return response.status(400).json({ error: "Message content is required." });
    if (content.length > 100_000) return response.status(413).json({ error: "Message is too long." });

    const userMessage = database.addMessage(request.params.id, "user", content);
    if (!userMessage) return response.status(404).json({ error: "Conversation not found." });

    try {
      const conversation = database.getConversation(request.params.id);
      const result = await openai.responses.create({
        model: config.openaiModel,
        instructions: SYSTEM_PROMPT,
        input: conversation.messages.map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        })),
        store: false,
      });

      const assistantContent = result.output_text;
      if (typeof assistantContent !== "string" || !assistantContent.trim()) {
        throw new Error("OpenAI returned an empty response.");
      }
      const assistantMessage = database.addMessage(request.params.id, "assistant", assistantContent);
      return response.status(201).json({
        assistant_message: {
          ...assistantMessage,
          rendered_content: renderMarkdown(assistantMessage.content),
        },
        conversation: presentConversation(database.getConversation(request.params.id)),
        user_message: userMessage,
      });
    } catch (error) {
      console.error("OpenAI request failed:", error);
      return response.status(502).json({
        error: "The AI request failed. Your message was saved; please try again.",
        user_message: userMessage,
      });
    }
  });

  app.get("/api/export", (_request, response) => {
    const exportedAt = new Date().toISOString();
    const filenameDate = exportedAt.slice(0, 10);
    response.setHeader("Content-Disposition", `attachment; filename="private-chat-export-${filenameDate}.json"`);
    response.type("application/json").send(JSON.stringify({
      exported_at: exportedAt,
      conversations: database.exportAll(),
    }, null, 2));
  });

  app.use(express.static(publicDirectory, { extensions: ["html"] }));

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: "Unexpected server error." });
  });

  return app;
}
