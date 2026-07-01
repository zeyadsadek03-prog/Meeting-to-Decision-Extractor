export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { transcript, webhookUrl, channel } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Missing transcript' });
    }

    const CHUNK_SIZE = 5000;
    const chunks = [];
    for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
      chunks.push(transcript.slice(i, i + CHUNK_SIZE));
    }

    const prompt = `You are a meeting assistant. Extract ONLY decisions, action items, owners, and deadlines from this transcript.
Return STRICT JSON with these keys:
{
  "decisions": [{"text": "...", "owner": "optional"}],
  "actions": [{"task": "...", "owner": "...", "deadline": "optional"}],
  "deadlines": ["..."],
  "notes": "optional short summary"
}

Transcript:
${chunks[0]}`;

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
      return res.status(502).json({ error: 'Groq failed', detail: t.slice(0, 300) });
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { raw: content };
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

    if (webhookUrl) {
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
    }

    return res.status(200).json({ formatted, parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
