import { CourierQuickNotice, CourierQuickNoticeType } from '../types';

export interface QuickNoticeMeta {
  type: CourierQuickNoticeType;
  stage: 'pickup' | 'delivery';
  courierButtonLabel: string;
  clientHeadline: string;
  clientSubtext: string;
  tone: 'amber' | 'emerald' | 'blue';
}

export const QUICK_NOTICE_META: Record<CourierQuickNoticeType, QuickNoticeMeta> = {
  chegando_coleta: {
    type: 'chegando_coleta',
    stage: 'pickup',
    courierButtonLabel: 'Avisar: Estou chegando para retirar',
    clientHeadline: 'Entregador a caminho — chegando para retirar',
    clientSubtext:
      'Separe o pacote e tenha o código de retirada em mãos para agilizar o atendimento.',
    tone: 'blue',
  },
  chegou_coleta: {
    type: 'chegou_coleta',
    stage: 'pickup',
    courierButtonLabel: 'Cheguei no local de coleta',
    clientHeadline: 'Entregador chegou no local de coleta!',
    clientSubtext:
      'O entregador já está aguardando para retirar o pedido. Confira o código antes de entregar.',
    tone: 'amber',
  },
  chegando_entrega: {
    type: 'chegando_entrega',
    stage: 'delivery',
    courierButtonLabel: 'Avisar: Estou chegando — aguarde na calçada/portaria',
    clientHeadline: 'Entregador chegando — aguarde na calçada/portaria!',
    clientSubtext:
      'Fique atento na portaria ou calçada para receber a entrega sem atrasos.',
    tone: 'emerald',
  },
};

export function getQuickNoticeMessage(
  type: CourierQuickNoticeType
): string {
  return QUICK_NOTICE_META[type].clientHeadline;
}

export function buildCourierQuickNotice(
  type: CourierQuickNoticeType,
  updatedAt = new Date().toISOString(),
  stopSequence?: number
): CourierQuickNotice {
  return {
    type,
    message: getQuickNoticeMessage(type),
    updatedAt,
    ...(stopSequence ? { stopSequence } : {}),
  };
}

export function isCourierQuickNoticeType(
  value: string | null | undefined
): value is CourierQuickNoticeType {
  return (
    value === 'chegando_coleta' ||
    value === 'chegou_coleta' ||
    value === 'chegando_entrega'
  );
}

export function extractBrPhoneDigits(raw?: string | null): string | null {
  if (!raw) return null;
  // Find phone-like sequences first in freeform text (e.g. notes)
  const phoneCandidateMatch = raw.match(
    /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/
  );
  const target = phoneCandidateMatch ? phoneCandidateMatch[0] : raw;
  const digits = target.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits;
  }
  return null;
}

export function buildQuickNoticeWhatsAppMessage(params: {
  stage: 'pickup' | 'delivery';
  orderCode: string;
  activeNoticeType?: CourierQuickNoticeType;
  courierName?: string;
  vehicleType?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehiclePlate?: string;
}): string {
  const {
    stage,
    orderCode,
    activeNoticeType,
    courierName,
    vehicleType,
    vehicleModel,
    vehicleColor,
    vehiclePlate,
  } = params;

  const cleanName = courierName?.trim();
  const intro = cleanName
    ? `Olá! Sou ${cleanName}, seu entregador do RotaJusta`
    : `Olá! Sou seu entregador do RotaJusta`;

  const modelColorParts = [vehicleModel?.trim(), vehicleColor?.trim()].filter(
    Boolean
  );
  const modelColorStr = modelColorParts.join(' • ');
  const cleanPlate = vehiclePlate?.trim().toUpperCase();

  let vehicleDetail = '';
  if (vehicleType === 'Bike') {
    vehicleDetail = modelColorStr
      ? ` (Bicicleta: ${modelColorStr})`
      : ` (Bicicleta)`;
  } else {
    const detailBits: string[] = [];
    if (modelColorStr) {
      detailBits.push(modelColorStr);
    } else if (vehicleType) {
      detailBits.push(vehicleType);
    }
    if (cleanPlate) {
      detailBits.push(`placa ${cleanPlate}`);
    }
    if (detailBits.length > 0) {
      vehicleDetail = ` (${detailBits.join(', ')})`;
    }
  }

  if (stage === 'pickup') {
    if (activeNoticeType === 'chegou_coleta') {
      return `${intro}${vehicleDetail}. Já cheguei no local de coleta para retirar o pedido ${orderCode}.`;
    }
    return `${intro}${vehicleDetail}. Estou chegando para retirar o pedido ${orderCode}.`;
  }

  return `${intro}${vehicleDetail}. Estou chegando com o pedido ${orderCode}, por favor aguarde na calçada/portaria.`;
}

export function buildWhatsAppUrl(params: {
  phone?: string | null;
  message: string;
}): string {
  const encodedMessage = encodeURIComponent(params.message);
  const brDigits = extractBrPhoneDigits(params.phone);
  if (brDigits) {
    return `https://wa.me/${brDigits}?text=${encodedMessage}`;
  }
  return `https://wa.me/?text=${encodedMessage}`;
}
