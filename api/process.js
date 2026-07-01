import normalize from '../lib/normalize.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const rawTranscript = req.body?.transcript || '';
  if (!rawTranscript.trim()) {
    return res.status(400).json({ error: 'Empty transcript' });
  }

  // normalized text
  const normalized = normalize(rawTranscript);

  // MVP placeholder: return structured mock until Groq integration is added
  const result = {
    decisions: ['MVP extraction stub — pending Groq integration'],
    actionItems: [{ owner: 'Zeyad', task: 'Add Groq extraction + Slack post', deadline: 'Day 2' }],
    deadlines: [],
    raw: normalized
  };

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}