import { PaymentStatus, PixKeyType, PixPaymentMethod } from '../types';

export const PIX_KEY_TYPES: PixKeyType[] = [
  'CPF',
  'Telefone',
  'E-mail',
  'Chave Aleatória',
];

export function getPixKeyPlaceholder(type: PixKeyType): string {
  switch (type) {
    case 'CPF':
      return '000.000.000-00';
    case 'Telefone':
      return '(51) 99999-0000';
    case 'E-mail':
      return 'nome@exemplo.com';
    case 'Chave Aleatória':
      return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  }
}

export function inferPixKeyType(pixKey?: string | null): PixKeyType {
  const val = (pixKey || '').trim();
  if (!val) return 'Telefone';
  if (val.includes('@')) return 'E-mail';
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      val
    ) ||
    /^[0-9a-f]{32}$/i.test(val)
  ) {
    return 'Chave Aleatória';
  }
  const digits = val.replace(/\D/g, '');
  if (digits.length === 11 && !val.includes('(') && !val.startsWith('+')) {
    // Heuristic: if formatted like CPF (dots/dash) or 11 digits without DDD pattern
    if (val.includes('.') || val.includes('-')) {
      return 'CPF';
    }
  }
  if (val.includes('(') || val.startsWith('+55') || digits.length === 10 || digits.length === 11) {
    return 'Telefone';
  }
  return 'Chave Aleatória';
}

export function formatPaymentMethodLabel(method?: PixPaymentMethod): string {
  if (method === 'pix_plataforma') {
    return 'Pix para Plataforma RotaJusta';
  }
  return 'Pix Direto ao Entregador';
}

export function formatPaymentStatusLabel(status?: PaymentStatus): string {
  if (status === 'pago_lojista') return 'Pix Confirmado pelo Lojista';
  if (status === 'repassado') return 'Pagamento Recebido / Concluído';
  return 'Aguardando Pix do Lojista';
}

function stripDiacriticsAscii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-/]/g, '')
    .trim();
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function normalizePixKeyForPayload(rawKey: string): string {
  const val = rawKey.trim();
  if (!val) return '';
  if (val.includes('@')) return val.toLowerCase();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      val
    ) ||
    /^[0-9a-f]{32}$/i.test(val)
  ) {
    return val.toLowerCase();
  }
  const digits = val.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits;
  }
  if (
    digits.length === 11 &&
    (val.includes('.') || val.includes('-')) &&
    !val.includes('(') &&
    !val.startsWith('+')
  ) {
    return digits;
  }
  if (val.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return `+${digits}`;
  }
  return val;
}

export function buildPixCopyPastePayload(params: {
  pixKey: string;
  amount: number;
  recipientName: string;
  orderCode: string;
  city?: string;
}): string {
  const normalizedKey = normalizePixKeyForPayload(params.pixKey);
  if (!normalizedKey) return '';

  const cleanRecipient = (
    stripDiacriticsAscii(params.recipientName).toUpperCase() || 'ROTAJUSTA POA'
  ).slice(0, 25);
  const cleanCity = (
    stripDiacriticsAscii(params.city || 'PORTO ALEGRE').toUpperCase() ||
    'PORTO ALEGRE'
  ).slice(0, 15);
  const cleanTxid =
    params.orderCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 25) ||
    'ROTAJUSTA';
  const cleanDesc = `RotaJusta ${params.orderCode}`.slice(0, 32);

  const maiContent =
    tlv('00', 'br.gov.bcb.pix') +
    tlv('01', normalizedKey) +
    (normalizedKey.length <= 50 ? tlv('02', cleanDesc) : '');

  const safeAmount = Math.max(0.01, Number(params.amount) || 0.01).toFixed(2);

  const basePayload =
    tlv('00', '01') +
    tlv('26', maiContent) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', safeAmount) +
    tlv('58', 'BR') +
    tlv('59', cleanRecipient) +
    tlv('60', cleanCity) +
    tlv('62', tlv('05', cleanTxid)) +
    '6304';

  return `${basePayload}${crc16Ccitt(basePayload)}`;
}
