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
  const users = getUsers();
  users[normalized] = {
    email: normalized,
    webhooks: Array.isArray(webhooks) ? webhooks.filter(Boolean) : [],
    updatedAt: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function getUser(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return getUsers()[normalized] || null;
}

export function deleteUser(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const users = getUsers();
  delete users[normalized];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function getCurrentUser() {
  return localStorage.getItem('mtd_current_user') || '';
}

export function setCurrentUser(email) {
  localStorage.setItem('mtd_current_user', String(email || '').trim().toLowerCase());
}

export function clearCurrentUser() {
  localStorage.removeItem('mtd_current_user');
}
