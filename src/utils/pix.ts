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
  if (status === 'repassado') return 'Repasse Concluído';
  return 'Aguardando Pix do Lojista';
}
