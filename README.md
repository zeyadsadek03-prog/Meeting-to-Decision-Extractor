# Meeting-to-Decision Extractor

Paste a transcript. Get decisions, owners, and deadlines. Auto-post to Slack.

## Run locally
```bash
npm install
npm run dev
```

## Deploy
- Connect this repo to Vercel
- Set `GROQ_API_KEY` in Vercel env vars

## Stack
- Frontend: `index.html` + Tailwind CDN
- API: `/api/process` (extraction + Slack post)
- Analytics: `/api/analytics` (Vercel KV kill-criteria tracking)

MIT licensed.
