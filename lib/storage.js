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
