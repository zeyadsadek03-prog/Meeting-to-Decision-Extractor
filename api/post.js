export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, webhookUrl, telegram } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text' });
    }

    const urls = Array.isArray(webhookUrl)
      ? webhookUrl.filter(Boolean)
      : typeof webhookUrl === 'string'
        ? [webhookUrl]
        : [];

    if (urls.length === 0) {
      return res.status(400).json({ error: 'Missing Slack webhook URL' });
    }

    await Promise.all(
      urls.map((url) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'Meeting summary',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '*Meeting summary*\n\n' + text },
              },
            ],
          }),
        }).catch(() => {})
      )
    );

    const tg =
      typeof telegram === 'object' && telegram?.token && telegram?.chatId
        ? telegram
        : null;

    if (tg) {
      await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tg.chatId,
          text: 'Meeting summary\n\n' + text,
        }),
      }).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
