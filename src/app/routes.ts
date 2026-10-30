export function normalizeRoute(value: string): string {
  const raw = value.replace(/^#+/, '');
  return raw.startsWith('/') ? raw : `/${raw || 'home'}`;
}

export function activeSection(value: string): string {
  return normalizeRoute(value).split('/').filter(Boolean)[0] || 'home';
}
