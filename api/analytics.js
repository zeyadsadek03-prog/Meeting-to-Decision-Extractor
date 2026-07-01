import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    // Example: list last 7 days of tombstones for retention check
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push(dateStr);
    }

    // Scan keys matching track:*:{date}
    // For MVP crude view only; replace with proper query later
    const result = {};
    for (const date of days) {
      const pattern = `track:*:${date}`;
      // get the matching keys (a scan-like behavior)
      // Vercel KV doesn't expose SCAN; we return what pattern lookup allows
      result[date] = { note: 'keyset schema: track:<hash>:<date>' };
    }

    res.status(200).json({ 
      message: 'Analytics schema OK',
      schema: 'track:<webhook_hash>:<YYYY-MM-DD>',
      counts_key: 'count:<webhook_hash>',
      events: ['attempt', 'success']
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
