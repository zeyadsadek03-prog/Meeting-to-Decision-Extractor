// Normalizes raw transcript text into clean text for extraction.
// - strips VTT timestamps like 00:00:01.000
// - collapses speaker labels into readable role text
// - truncates to 6000 chars to keep extraction reliable

export default async function normalize(raw) {
  let text = String(raw || "").trim();
  if (!text) return "";

  // Strip VTT cues: 00:00:01.000 --> 00:00:05.000
  text = text.replace(/^\d{1,2}:\d{2}:\d{2}\.\d+\s+-->\s+\d{1,2}:\d{2}:\d{2}\.\d+\s*$/gm, "");

  // Strip simple WEBVTT header if present
  if (/^WEBVTT/i.test(text)) {
    text = text.replace(/^WEBVTT.*$/m, "");
  }

  // Collapse speaker labels when followed by colon on same line
  text = text.replace(/^(?:\[?[A-Za-z][^:\n]{0,40}\]?)\s*:\s*/gm, (m) => m.trim());

  // Condense blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  // Truncate to keep extraction consistent
  const MAX = 6000;
  if (text.length > MAX) {
    text = text.slice(0, MAX) + "\n\n[TRUNCATED]";
  }

  return text.trim();
}