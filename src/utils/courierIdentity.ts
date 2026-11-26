export function formatPlateInput(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/--+/g, '-');

  // Remove hyphens beyond the first one and clamp to max 8 chars (e.g. ABC-1234 or ABC1D23)
  const firstHyphen = cleaned.indexOf('-');
  if (firstHyphen !== -1) {
    const before = cleaned.slice(0, firstHyphen).replace(/-/g, '').slice(0, 3);
    const after = cleaned
      .slice(firstHyphen + 1)
      .replace(/-/g, '')
      .slice(0, 4);
    return `${before}-${after}`.slice(0, 8);
  }

  return cleaned.slice(0, 7);
}

export function normalizePlateForDisplay(raw?: string | null): string {
  if (!raw) return '';
  return formatPlateInput(raw.trim());
}

export function isValidBrazilianPlate(raw: string): boolean {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 7) return false;
  // Mercosul (AAA0A00) or Antiga (AAA0000)
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(compact);
}

export function getNameInitials(name?: string | null): string {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'RJ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatVehicleModelAndColor(
  model?: string | null,
  color?: string | null
): string {
  const cleanModel = (model || '').trim();
  const cleanColor = (color || '').trim();
  if (cleanModel && cleanColor) return `${cleanModel} • ${cleanColor}`;
  return cleanModel || cleanColor || '';
}
