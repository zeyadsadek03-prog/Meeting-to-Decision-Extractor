const STORAGE_KEY = 'mtd_users';

export function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveUser(email, webhooks) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const items = Array.isArray(webhooks) ? webhooks.filter(Boolean) : [];
  const users = getUsers();
  users[normalized] = {
    email: normalized,
    webhooks: items.map(w => ({ name: String(w.name || '').trim(), url: String(w.url || '').trim() })).filter(w => w.url),
    updatedAt: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function getUser(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const user = getUsers()[normalized] || null;
  if (user && Array.isArray(user.webhooks)) {
    user.webhooks = user.webhooks.map(w => {
      if (typeof w === 'string') return { name: 'Imported', url: w };
      return { name: String(w.name || 'Untitled').trim(), url: String(w.url || '').trim() };
    }).filter(w => w.url);
  }
  return user;
}

export function deleteUser(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const users = getUsers();
  delete users[normalized];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function getCurrentUser() {
  try {
    return localStorage.getItem('mtd_current_user') || '';
  } catch {
    return '';
  }
}

export function setCurrentUser(email) {
  try {
    localStorage.setItem('mtd_current_user', String(email || '').trim().toLowerCase());
  } catch {
    // ignore storage write failures
  }
}

export function clearCurrentUser() {
  try {
    localStorage.removeItem('mtd_current_user');
  } catch {
    // ignore storage write failures
  }
}

const PROMPTS_KEY = 'mtd_prompts';

export function getPrompts(email) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(PROMPTS_KEY) || '{}');
    return Array.isArray(raw[prefix]) ? raw[prefix] : [];
  } catch {
    return [];
  }
}

export function savePrompts(email, prompts) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return;
  const items = Array.isArray(prompts) ? prompts.filter(Boolean) : [];
  try {
    const raw = JSON.parse(localStorage.getItem(PROMPTS_KEY) || '{}');
    raw[prefix] = items.map(p => ({ id: String(p.id || ''), name: String(p.name || '').trim(), body: String(p.body || '').trim() })).filter(p => p.id);
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(raw));
  } catch {
    // ignore
  }
}

export function addPrompt(email, name, body) {
  const prompts = getPrompts(email);
  const id = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || 'prompt-' + Date.now();
  prompts.push({ id: id + '-' + Date.now(), name: name.trim(), body: body.trim() });
  savePrompts(email, prompts);
  return prompts;
}

export function updatePrompt(email, id, name, body) {
  const prompts = getPrompts(email).map(p => p.id === id ? { ...p, name: name.trim(), body: body.trim() } : p).filter(Boolean);
  savePrompts(email, prompts);
  return prompts;
}

export function deletePrompt(email, id) {
  const prompts = getPrompts(email).filter(p => p.id !== id);
  savePrompts(email, prompts);
  return prompts;
}

const HISTORY_KEY = 'mtd_history';

export function getHistory(email) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw[prefix]) ? raw[prefix] : [];
  } catch {
    return [];
  }
}

export function saveHistory(email, items) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return;
  const list = Array.isArray(items) ? items.slice(-50) : [];
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    raw[prefix] = list;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(raw));
  } catch {
    // ignore
  }
}

export function clearHistory(email) {
  saveHistory(email, []);
}

export function addHistory(email, item) {
  const items = getHistory(email);
  items.push(item);
  saveHistory(email, items);
}

const DEFAULT_WEBHOOK_KEY = 'mtd_default_webhook';

export function getDefaultWebhook(email) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return '';
  try {
    return localStorage.getItem(DEFAULT_WEBHOOK_KEY + ':' + prefix) || '';
  } catch {
    return '';
  }
}

export function setDefaultWebhook(email, url) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return;
  try {
    if (url) localStorage.setItem(DEFAULT_WEBHOOK_KEY + ':' + prefix, String(url));
    else localStorage.removeItem(DEFAULT_WEBHOOK_KEY + ':' + prefix);
  } catch {
    // ignore
  }
}

const EMAIL_KEY = 'mtd_email';

export function getEmail(email) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return '';
  try {
    return localStorage.getItem(EMAIL_KEY + ':' + prefix) || '';
  } catch {
    return '';
  }
}

export function setEmail(email, value) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return;
  try {
    if (value) localStorage.setItem(EMAIL_KEY + ':' + prefix, String(value));
    else localStorage.removeItem(EMAIL_KEY + ':' + prefix);
  } catch {
    // ignore
  }
}

const TELEGRAM_KEY = 'mtd_telegram';

export function getTelegramConfig(email) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return null;
  try {
    return JSON.parse(localStorage.getItem(TELEGRAM_KEY + ':' + prefix) || 'null');
  } catch {
    return null;
  }
}

export function setTelegramConfig(email, cfg) {
  const prefix = String(email || '').trim().toLowerCase();
  if (!prefix) return;
  try {
    localStorage.setItem(TELEGRAM_KEY + ':' + prefix, JSON.stringify(cfg || {}));
  } catch {
    // ignore
  }
}

