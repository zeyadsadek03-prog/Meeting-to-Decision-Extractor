# Meeting-to-Decision Extractor

Paste a transcript. Get decisions, owners, and deadlines. Auto-post to Slack.

## Stack
- Frontend: `index.html` + Tailwind CDN
- API: `/api/process` (extraction + Slack post)
- Analytics: `/api/analytics` (Vercel KV kill-criteria tracking)

## Env vars
- `GROQ_API_KEY` — Groq API key
- `SLACK_WEBHOOK_URL` — Slack incoming webhook URL

## Run locally
```bash
npm install
npm run dev
```

## Deploy
- Connect repo to Vercel
- Set env vars in Vercel dashboard

MIT licensed.