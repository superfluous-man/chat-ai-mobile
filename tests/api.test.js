import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp, SYSTEM_PROMPT } from "../src/app.js";
import { openDatabase } from "../src/database.js";

test("authenticated chat flow saves and exports exact messages", async (context) => {
  const database = openDatabase(":memory:");
  const calls = [];
  const openai = {
    responses: {
      async create(input) {
        calls.push(input);
        return { output_text: "A witty reply." };
      },
    },
  };
  const config = {
    appPassword: "test-password",
    isProduction: false,
    openaiModel: "test-model",
    sessionSecret: "test-session-secret-with-more-than-32-characters",
  };
  const server = createApp({ config, database, openai }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  context.after(() => {
    server.close();
    database.close();
  });

  const denied = await fetch(`${baseUrl}/api/conversations`);
  assert.equal(denied.status, 401);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "test-password", remember: true }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];

  const created = await fetch(`${baseUrl}/api/conversations`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
  });
  const { conversation } = await created.json();

  const exactUserText = "  Keep this exact.\n";
  const sent = await fetch(`${baseUrl}/api/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ content: exactUserText }),
  });
  assert.equal(sent.status, 201);
  assert.equal(calls[0].instructions, SYSTEM_PROMPT);
  assert.equal(calls[0].model, "test-model");
  assert.equal(calls[0].store, false);
  assert.deepEqual(calls[0].input, [{ role: "user", content: exactUserText }]);

  const followUp = await fetch(`${baseUrl}/api/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ content: "What did I just say?" }),
  });
  assert.equal(followUp.status, 201);
  assert.deepEqual(calls[1].input, [
    { role: "user", content: exactUserText },
    { role: "assistant", content: "A witty reply." },
    { role: "user", content: "What did I just say?" },
  ]);

  const exported = await fetch(`${baseUrl}/api/export`, { headers: { cookie } });
  const payload = await exported.json();
  assert.equal(payload.conversations[0].id, conversation.id);
  assert.deepEqual(payload.conversations[0].messages.map(({ role, content }) => ({ role, content })), [
    { role: "user", content: exactUserText },
    { role: "assistant", content: "A witty reply." },
    { role: "user", content: "What did I just say?" },
    { role: "assistant", content: "A witty reply." },
  ]);
});
