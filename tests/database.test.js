import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/database.js";

test("conversations, messages, titles, and exports persist", () => {
  const database = openDatabase(":memory:");
  const conversation = database.createConversation();
  const exactText = "First line\n\n  spacing stays exact  ";

  database.addMessage(conversation.id, "user", exactText);
  database.addMessage(conversation.id, "assistant", "Exact assistant reply.");

  const stored = database.getConversation(conversation.id);
  assert.equal(stored.title, "First line spacing stays exact");
  assert.equal(stored.messages[0].content, exactText);
  assert.deepEqual(database.exportAll()[0].messages, stored.messages);

  database.updateTitle(conversation.id, "Renamed");
  assert.equal(database.getConversation(conversation.id).title, "Renamed");
  assert.equal(database.deleteConversation(conversation.id), true);
  assert.equal(database.getConversation(conversation.id), null);
  database.close();
});
