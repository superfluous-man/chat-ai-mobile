# Private AI Chat

A small, password-protected, mobile-first AI chat you can host yourself. It uses the OpenAI Responses API on the server and keeps every conversation in one SQLite database file that you control.

## What is included

- Single-user password login with a signed, HTTP-only session cookie
- 30-day “remember me” option
- Mobile-first conversation list and chat interface
- Markdown rendering for assistant replies, including code blocks, links, lists, quotes, and tables
- Automatic local titles plus manual title editing
- Conversation deletion
- Full conversation context sent with each AI request
- Automatic SQLite persistence for every message
- Human-readable JSON export of all conversations
- Docker deployment with a persistent volume

The app intentionally has no registration, password recovery, multi-user system, vector database, or browser-side canonical storage.

## Requirements

- Node.js 22 or newer
- An OpenAI API key

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.
3. Fill in the required secrets described below.
4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

Production-style local start:

```bash
npm start
```

Run validation:

```bash
npm run build
npm test
```

There is no frontend compilation step; `npm run build` syntax-checks every JavaScript file.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Server-side OpenAI API key. Never sent to the browser. |
| `OPENAI_MODEL` | Yes | Model ID passed to the OpenAI Responses API, for example `gpt-5-mini`. |
| `APP_PASSWORD` | Yes | The password used to unlock the app. Use a long, unique value. |
| `SESSION_SECRET` | Yes | Signs login cookies. Must be at least 32 characters and should be random. |
| `DATABASE_PATH` | No | SQLite file path. Defaults to `./data/chat.sqlite`; use `/data/chat.sqlite` on Railway. |
| `PORT` | No | HTTP port. Defaults to `3000`; Railway supplies this automatically. |
| `NODE_ENV` | No | Set to `production` in deployment so the session cookie is HTTPS-only. |

Generate a strong session secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not commit `.env`. It is ignored by Git.

## Fastest deployment: Railway

Railway is a good fit for this MVP because the included Dockerfile runs the app and a Railway Volume keeps the SQLite file across restarts and deployments.

1. Push this repository to GitHub.
2. In Railway, create a project and choose **Deploy from GitHub repo**.
3. Add a Volume to the web service and set its mount path to `/data`.
4. Add these service variables:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `APP_PASSWORD`
   - `SESSION_SECRET`
   - `DATABASE_PATH=/data/chat.sqlite`
   - `NODE_ENV=production`
5. In the service Networking settings, choose **Generate Domain**.
6. Open the generated HTTPS URL and log in.

**Do not skip the Volume.** Without it, the container filesystem is temporary and conversations can disappear during a redeploy. Railway documents Volume setup and mount paths in its [Volumes guide](https://docs.railway.com/volumes).

The app exposes `/health` for platform health checks.

## Data ownership and backups

The canonical database is the single file at `DATABASE_PATH`. The **Export all** button downloads this shape without summarizing or changing message text:

```json
{
  "exported_at": "2026-01-01T12:00:00.000Z",
  "conversations": [
    {
      "id": "...",
      "title": "...",
      "created_at": "...",
      "updated_at": "...",
      "messages": [
        {
          "role": "user",
          "content": "Exact message text",
          "timestamp": "..."
        }
      ]
    }
  ]
}
```

Export periodically and store the JSON somewhere safe. You can also back up the SQLite file or use Railway Volume backups.

## Security notes

- The OpenAI key exists only in the server environment.
- Session cookies are signed, HTTP-only, SameSite Strict, and Secure in production.
- Login attempts are rate-limited per server instance.
- API responses are rendered as text, not injected HTML.
- OpenAI requests set `store: false`; conversation history is supplied from your SQLite database each time.
- Anyone with both the public URL and app password can access all chats, so keep the password private.

The OpenAI server integration follows the official [JavaScript SDK documentation](https://developers.openai.com/api/docs/libraries) and uses the Responses API.
