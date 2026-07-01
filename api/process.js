import { kv } from '@vercel/kv';

function hashWebhook(url) {
  try {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
  } catch {
    return 'unknown';
  }
}

function hashTranscript(text) {
  try {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  } catch {
    return 'unknown';
  }
}

async function trackEvent(webhookHash, event, data = {}) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `track:${webhookHash}:${today}`;
    const countKey = `count:${webhookHash}`;
    
    await kv.hincrby(key, event, 1);
    await kv.hincrby(countKey, 'total', 1);
    await kv.hset(key, { 
      last_seen: new Date().toISOString(),
      webhook_hash: webhookHash 
    });
  } catch {
    // analytics must not break main flow
  }
}

function normalizeTranscript(text) {
  let s = text.replace(/\r\n/g, '\n');

  // VTT timestamp blocks like 00:00:01.234 --> 00:00:04.567
  s = s.replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*$/gm, '');

  // WEBVTT header line
  s = s.replace(/^WEBVTT.*$/gm, '');

  // Speaker labels like "Zeyad:" or "Zeyad >"
  s = s.replace(/^([A-Za-z][A-Za-z0-9_\s]+?)[\s:>]+/gm, '$1: ');

  // Blank-line collapses
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

async function extractJson(prompt) {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You only output JSON. No explanations.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!groqRes.ok) {
    const t = await groqRes.text();
    throw new Error('Groq failed: ' + t.slice(0, 300));
  }

  const groqData = await groqRes.json();
  const content = groqData.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { transcript, webhookUrl } = req.body || {};

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Missing transcript' });
    }
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'Missing Slack webhook URL' });
    }

    const webhookHash = hashWebhook(webhookUrl);
    const transcriptHash = hashTranscript(transcript);
    const dedupKey = `posted:${webhookHash}:${transcriptHash}`;

    // Idempotency check: skip if already posted within 10 minutes
    const alreadyPosted = await kv.get(dedupKey);
    if (alreadyPosted) {
      return res.status(200).json({ formatted: '—', note: 'Already posted to Slack recently. Skipping duplicate.' });
    }

    const normalized = normalizeTranscript(transcript);
    await trackEvent(webhookHash, 'attempt');

    const prompt = `You are a meeting assistant. Extract ONLY decisions, action items, owners, and deadlines.
Return STRICT JSON:
{
  "decisions": [{"text": "...", "owner": "optional"}],
  "actions": [{"task": "...", "owner": "...", "deadline": "optional"}],
  "deadlines": ["..."],
  "notes": "optional short summary"
}

Few-shot example input:
"Zeyad: We're moving the launch to June 15. Ali will update the landing page. Sara: I'm OOO next Monday but will review the QA sheet by EOD tomorrow."

Expected output:
{
  "decisions": [{"text": "Move launch to June 15", "owner": "Team"}],
  "actions": [{"task": "Update landing page", "owner": "Ali"}, {"task": "Review QA sheet", "owner": "Sara", "deadline": "EOD tomorrow"}],
  "deadlines": ["EOD tomorrow", "June 15"],
  "notes": "Sara unavailable next Monday"
}

Transcript:
${normalized.slice(0, 6000)}`;

    let parsed = await extractJson(prompt);

    // Retry once with stricter reminder
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.decisions)) {
      parsed = await extractJson(prompt + '\n\nReturn ONLY valid JSON. No markdown fences. No text before/after JSON. Ensure keys: decisions, actions, deadlines, notes.');
    }

    const decisions = (parsed.decisions || []).map(d => `• ${d.text}${d.owner ? ` (owner: ${d.owner})` : ''}`).join('\n');
    const actions = (parsed.actions || []).map(a => `• ${a.task} — owner: ${a.owner || 'unassigned'}${a.deadline ? ` — due: ${a.deadline}` : ''}`).join('\n');
    const deadlines = (parsed.deadlines || []).length ? parsed.deadlines.join('\n') : '—';
    const notes = parsed.notes ? `Notes: ${parsed.notes}` : '';

    const formatted = `*Decisions*
${decisions || '—'}

*Actions*
${actions || '—'}

*Deadlines*
${deadlines}

${notes}`.trim();

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Meeting summary',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: '*Meeting summary*\n\n' + formatted } }
        ]
      })
    });

    await trackEvent(webhookHash, 'success');

    // Mark as posted for 10 minutes to prevent duplicates
    await kv.set(dedupKey, '1', { ex: 600 });

    return res.status(200).json({ formatted, parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
