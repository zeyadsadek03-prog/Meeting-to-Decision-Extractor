export default async function handler(req, res) {
  res.writeHead(200, { 'content-type': 'application/json' });
  return res.end(JSON.stringify({ ok: true, mode: 'stub' }));
}