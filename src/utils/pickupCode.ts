export function formatPickupCode(id: string): string {
  const clean = String(id || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  const suffix = clean.slice(0, 4).padEnd(4, '0');
  return `#RS-${suffix}`;
}

export function normalizeCodeSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/^#/, '');
}
