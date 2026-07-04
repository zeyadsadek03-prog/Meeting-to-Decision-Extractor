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

function formatOutput(parsed) {
  const decisions = (parsed.decisions || []).map(d => `• ${d.text}${d.owner ? ` (owner: ${d.owner})` : ''}`).join('\n');
  const actions = (parsed.actions || []).map(a => `• ${a.task || a.action || ''} — owner: ${a.owner || 'unassigned'}${a.deadline ? ` — due: ${a.deadline}` : ''}`).join('\n');
  const deadlines = (parsed.deadlines || []).length ? parsed.deadlines.join('\n') : '—';
  const notes = parsed.notes ? `Notes: ${parsed.notes}` : '';
  return `*Decisions*\n${decisions || '—'}\n\n*Actions*\n${actions || '—'}\n\n*Deadlines*\n${deadlines}\n\n${notes}`.trim();
}

function getExtension(mimeType) {
  const map = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogg',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/mp3': '.mp3',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a'
  };
  return map[mimeType] || '.bin';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { video, prompt } = req.body || {};

    if (!video || typeof video !== 'string') {
      return res.status(400).json({ error: 'Missing video file' });
    }

    const base64Data = video.replace(/^data:[^;]+;base64,/, '');
    if (!base64Data) {
      return res.status(400).json({ error: 'Invalid video data' });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Max 4MB on Vercel free tier.' });
    }

    const mimeMatch = video.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    form.append('file', blob, 'upload' + getExtension(mimeType));
    form.append('model', 'whisper-large-v3-turbo');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: form
    });

    if (!groqRes.ok) {
      const t = await groqRes.text();
      throw new Error('Groq transcription failed: ' + t.slice(0, 300));
    }

    const groqData = await groqRes.json();
    const transcript = groqData.text || '';

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript generated. The file may be too short or unclear.' });
    }

    const promptBody = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : `Extract meeting outcomes from this transcript.\nFocus on: decisions, action items, owners, deadlines.\nIf a category is empty, return an empty array.\n\nReturn ONLY JSON, no markdown fences or extra text:\n{\n  "decisions": [{"text": "...", "owner": "optional"}],\n  "actions": [{"task": "...", "owner": "...", "deadline": "optional"}],\n  "deadlines": ["..."],\n  "notes": "optional brief summary"\n}`;

    const normalized = normalizeTranscript(transcript);
    const fullPrompt = `${promptBody}\n\nTranscript:\n${normalized.slice(0, 6000)}`;

    let parsed = await extractJson(fullPrompt);

    if (!parsed || typeof parsed !== 'object' || !('decisions' in parsed) || !('actions' in parsed)) {
      parsed = await extractJson('From the transcript, extract ONLY decisions, action items, owners, and deadlines as JSON. Keys required: decisions, actions, deadlines, notes. No markdown, no explanations, no keys beyond these.');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      parsed = { decisions: [], actions: [], deadlines: [], notes: '' };
    }

    return res.status(200).json({ transcript: normalized, formatted: formatOutput(parsed) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
