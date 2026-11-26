import { Profile } from '../types';
import { onlyDigits } from './documentValidation';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const normalized = normalizeEmail(raw);
  if (!normalized || normalized.length > 254 || normalized.includes('..')) {
    return false;
  }
  return EMAIL_REGEX.test(normalized);
}

function escapeCsvCell(value: string): string {
  const raw = value.replace(/\r?\n/g, ' ').trim();
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function resolveProfileLabel(profile: Profile): string {
  if (profile.role === 'admin') return 'Administrador';
  if (profile.role === 'entregador') return 'Entregador (PF)';
  if (profile.role === 'motorista') return 'Motorista (PF)';
  const docDigits = onlyDigits(profile.documentNumber || profile.document || '');
  if (profile.personType === 'PJ' || (!profile.personType && docDigits.length === 14)) {
    return 'Lojista / Empresa (PJ)';
  }
  return 'Pessoa Física (PF)';
}

export function exportAuthorizedEmailsCsv(profiles: Profile[]): {
  count: number;
  filename: string;
} {
  const authorized = profiles.filter(
    (p) => Boolean(p.acceptsMarketing) && Boolean(p.email && p.email.trim().length > 0)
  );

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `rotajusta_emails_autorizados_${dateStamp}.csv`;

  if (authorized.length === 0) {
    return { count: 0, filename };
  }

  const header = [
    'Nome',
    'E-mail',
    'Perfil',
    'Telefone',
    'Status',
    'Consentimento LGPD',
    'Data de Cadastro',
  ]
    .map(escapeCsvCell)
    .join(',');

  const rows = authorized.map((p) => {
    const email = normalizeEmail(p.email || '');
    const displayName = p.businessName || p.name || '';
    const perfil = resolveProfileLabel(p);
    const createdAt = p.createdAt ? p.createdAt.slice(0, 10) : '';
    return [
      displayName,
      email,
      perfil,
      p.phone || '',
      p.approvalStatus,
      'Autorizado (accepts_marketing=true)',
      createdAt,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csvContent = '\uFEFF' + [header, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { count: authorized.length, filename };
}
