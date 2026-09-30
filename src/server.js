import "dotenv/config";
import OpenAI from "openai";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
const openai = new OpenAI({ apiKey: config.openaiApiKey });
const app = createApp({ config, database, openai });

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Private AI Chat is running on http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
