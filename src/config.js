const required = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "APP_PASSWORD",
  "SESSION_SECRET",
];

export function loadConfig(environment = process.env) {
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (environment.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
  }

  const port = Number.parseInt(environment.PORT || "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid port number.");
  }

  return {
    appPassword: environment.APP_PASSWORD,
    databasePath: environment.DATABASE_PATH || "./data/chat.sqlite",
    isProduction: environment.NODE_ENV === "production",
    openaiApiKey: environment.OPENAI_API_KEY,
    openaiModel: environment.OPENAI_MODEL,
    port,
    sessionSecret: environment.SESSION_SECRET,
  };
}
