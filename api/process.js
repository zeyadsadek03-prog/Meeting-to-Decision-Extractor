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

function buildReturnLink(webhookUrl) {
  const params = new URLSearchParams({ w: webhookUrl });
  return `https://meeting-to-decision-extractor.vercel.app?${params.toString()}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { transcript, webhookUrl, prompt, telegram } = req.body || {};
    const webhookUrls = Array.isArray(webhookUrl) ? webhookUrl.filter(Boolean) : (typeof webhookUrl === 'string' ? [webhookUrl] : []);

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Missing transcript' });
    }
    if (webhookUrls.length === 0) {
      return res.status(400).json({ error: 'Missing Slack webhook URL' });
    }

    const normalized = normalizeTranscript(transcript);

    const promptBody = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : `Extract meeting outcomes from this transcript.
Focus on: decisions, action items, owners, deadlines.
If a category is empty, return an empty array.

Return ONLY JSON, no markdown fences or extra text:
{
  "decisions": [{"text": "...", "owner": "optional"}],
  "actions": [{"task": "...", "owner": "...", "deadline": "optional"}],
  "deadlines": ["..."],
  "notes": "optional brief summary"
}`;

    const fullPrompt = `${promptBody}

Transcript:
${normalized.slice(0, 6000)}`;

    let parsed = await extractJson(fullPrompt);

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

    const returnLink = webhookUrls.length === 1 ? buildReturnLink(webhookUrls[0]) : 'https://meeting-to-decision-extractor.vercel.app';

    await Promise.all(webhookUrls.map(url =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Meeting summary',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: '*Meeting summary*\n\n' + formatted } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Next meeting: paste transcript here → ${returnLink}` }] }
          ]
        })
      }).catch(() => {})
    ));

    const tg = typeof telegram === 'object' && telegram?.token && telegram?.chatId ? telegram : null;
    if (tg) {
      await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tg.chatId, text: 'Meeting summary\n\n' + formatted })
      }).catch(() => {});
    }

    return res.status(200).json({ formatted, parsed, returnLink });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
