import { kv } from '@vercel/kv';
import crypto from 'crypto';

function opaqueId() {
  return crypto.randomBytes(10).toString('hex');
}

function normalizeTranscript(text) {
  let s = text.replace(/\r\n/g, '\n');
  s = s.replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*$/gm, '');
  s = s.replace(/^WEBVTT.*$/gm, '');
  s = s.replace(/^([A-Za-z][A-Za-z0-9_\s]+?)[\s:>]+/gm, '$1: ');
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

    const normalized = normalizeTranscript(transcript);

    const prompt = `Extract meeting outcomes from this transcript.
Focus on: decisions, action items, owners, deadlines.
If a category is empty, return an empty array.

Return ONLY JSON, no markdown fences or extra text:
{
  "decisions": [{"text": "...", "owner": "optional"}],
  "actions": [{"task": "...", "owner": "...", "deadline": "optional"}],
  "deadlines": ["..."],
  "notes": "optional brief summary"
}

Examples:
Input: "Ali will send the report by Friday. We agreed to launch on June 20."
Output: {"decisions":[{"text":"Launch on June 20"}],"actions":[{"task":"Send report","owner":"Ali","deadline":"Friday"}],"deadlines":["Friday","June 20"],"notes":""}

Input: "Let's table this until next week."
Output: {"decisions":[{"text":"Table topic until next week"}],"actions":[],"deadlines":["next week"],"notes":""}

Transcript:
${normalized.slice(0, 6000)}`;

    let parsed = await extractJson(prompt);

    if (!parsed || typeof parsed !== 'object' || !('decisions' in parsed) || !('actions' in parsed)) {
      parsed = await extractJson('From the transcript, extract ONLY decisions, action items, owners, and deadlines as JSON. Keys required: decisions, actions, deadlines, notes. No markdown, no explanations, no keys beyond these.');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      parsed = { decisions: [], actions: [], deadlines: [], notes: '' };
    }

    const decisions = (parsed.decisions || []).map(d => `• ${d.text}${d.owner ? ` (owner: ${d.owner})` : ''}`).join('\n');
    const actions = (parsed.actions || []).map(a => `• ${a.task || a.action || ''} — owner: ${a.owner || 'unassigned'}${a.deadline ? ` — due: ${a.deadline}` : ''}`).join('\n');
    const deadlines = (parsed.deadlines || []).length ? parsed.deadlines.join('\n') : '—';
    const notes = parsed.notes ? `Notes: ${parsed.notes}` : '';

    const formatted = `*Decisions*\n${decisions || '—'}\n\n*Actions*\n${actions || '—'}\n\n*Deadlines*\n${deadlines}\n\n${notes}`.trim();

    const id = opaqueId();
    await kv.set(`webhook:${id}`, webhookUrl);
    await kv.expire(`webhook:${id}`, 60 * 60 * 24 * 30);

    const returnLink = `https://meeting-to-decision-extractor.vercel.app?w=${id}`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Meeting summary',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: '*Meeting summary*\n\n' + formatted } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `Next meeting: paste transcript here → ${returnLink}` }] }
        ]
      })
    });

    return res.status(200).json({ formatted, returnLink });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
