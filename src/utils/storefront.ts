import {
  MerchantStorefrontConfig,
  StorefrontOrderSummary,
  StoreProduct,
  VehicleType,
} from '../types';
import { formatBRL } from './pricing';

export const VITRINE_META_MARKER = '__RJ_VITRINE__:';

export interface VehicleOptionItem {
  value: VehicleType;
  shortLabel: string;
  hint: string;
}

export const STOREFRONT_VEHICLE_OPTIONS: VehicleOptionItem[] = [
  {
    value: 'Bike',
    shortLabel: 'Bike',
    hint: 'Pequenos pacotes leves (até 3 km)',
  },
  {
    value: 'Moto',
    shortLabel: 'Moto',
    hint: 'Caixas médias, alimentos e encomendas rápidas',
  },
  {
    value: 'Carro Pequeno (Passeio)',
    shortLabel: 'Carro',
    hint: 'Pedidos maiores, múltiplas sacolas ou frágeis',
  },
  {
    value: 'Utilitário / Picape / Van',
    shortLabel: 'Utilitário',
    hint: 'Volumes grandes, caixas pesadas ou equipamentos',
  },
];

export function formatShortVehicleLabel(vehicle: VehicleType): string {
  switch (vehicle) {
    case 'Bike':
      return 'Bike';
    case 'Moto':
      return 'Moto';
    case 'Carro Pequeno (Passeio)':
      return 'Carro';
    case 'Utilitário / Picape / Van':
      return 'Utilitário';
  }
}

export function normalizeStorefrontVehicle(
  raw?: string | null
): VehicleType {
  const normalized = (raw || '').trim().toLowerCase();
  if (normalized === 'bike' || normalized.includes('bicicleta')) {
    return 'Bike';
  }
  if (
    normalized === 'carro' ||
    normalized.includes('carro') ||
    normalized.includes('passeio')
  ) {
    return 'Carro Pequeno (Passeio)';
  }
  if (
    normalized === 'utilitario' ||
    normalized.includes('utilitário') ||
    normalized.includes('utilitario') ||
    normalized.includes('picape') ||
    normalized.includes('van') ||
    normalized.includes('fiorino')
  ) {
    return 'Utilitário / Picape / Van';
  }
  return 'Moto';
}

export function isSafeImageUrl(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/')
  );
}

export function getStorefrontVehicleRank(vehicle: VehicleType): number {
  switch (vehicle) {
    case 'Bike':
      return 1;
    case 'Moto':
      return 2;
    case 'Carro Pequeno (Passeio)':
      return 3;
    case 'Utilitário / Picape / Van':
      return 4;
  }
}

export function resolveRecommendedVehicleForCart(
  cartItems: Array<{ product: StoreProduct; quantity: number }>
): VehicleType {
  let best: VehicleType = 'Moto';
  let bestRank = 0;

  for (const item of cartItems) {
    if (item.quantity <= 0) continue;
    const rank = getStorefrontVehicleRank(item.product.recommendedVehicle);
    if (rank > bestRank) {
      bestRank = rank;
      best = item.product.recommendedVehicle;
    }
  }

  return bestRank > 0 ? best : 'Moto';
}

export function buildStorefrontUrl(merchantId: string): string {
  const cleanId = merchantId.trim();
  if (typeof window === 'undefined') {
    return `/?loja=${encodeURIComponent(cleanId)}`;
  }
  return `${window.location.origin}/?loja=${encodeURIComponent(cleanId)}`;
}

export function decodeStorefrontMetaFromCompanyName(
  raw?: string | null
): {
  cleanLegalName?: string;
  storefront?: MerchantStorefrontConfig;
} {
  if (!raw || raw.startsWith('__RJ_ID__:')) {
    return { cleanLegalName: undefined, storefront: undefined };
  }

  const markerIdx = raw.indexOf(VITRINE_META_MARKER);
  if (markerIdx === -1) {
    const trimmed = raw.trim();
    return {
      cleanLegalName: trimmed || undefined,
      storefront: undefined,
    };
  }

  const legalPart = raw.slice(0, markerIdx).trim();
  const jsonPart = raw.slice(markerIdx + VITRINE_META_MARKER.length).trim();

  let parsedStorefront: MerchantStorefrontConfig | undefined;
  if (jsonPart) {
    try {
      const obj = JSON.parse(jsonPart) as Partial<MerchantStorefrontConfig>;
      const rawProducts = Array.isArray(obj.products) ? obj.products : [];
      parsedStorefront = {
        storeName:
          typeof obj.storeName === 'string' && obj.storeName.trim()
            ? obj.storeName.trim()
            : undefined,
        storeDescription:
          typeof obj.storeDescription === 'string' && obj.storeDescription.trim()
            ? obj.storeDescription.trim()
            : undefined,
        storeCep:
          typeof obj.storeCep === 'string' && obj.storeCep.trim()
            ? obj.storeCep.trim()
            : undefined,
        storeAddress:
          typeof obj.storeAddress === 'string' && obj.storeAddress.trim()
            ? obj.storeAddress.trim()
            : undefined,
        storeNeighborhood:
          typeof obj.storeNeighborhood === 'string' &&
          obj.storeNeighborhood.trim()
            ? obj.storeNeighborhood.trim()
            : undefined,
        storeLat:
          typeof obj.storeLat === 'number' && Number.isFinite(obj.storeLat)
            ? obj.storeLat
            : undefined,
        storeLng:
          typeof obj.storeLng === 'number' && Number.isFinite(obj.storeLng)
            ? obj.storeLng
            : undefined,
        products: rawProducts
          .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: typeof p.description === 'string' ? p.description : '',
            price: Math.max(0, Number(p.price) || 0),
            imageUrl:
              typeof p.imageUrl === 'string' && p.imageUrl.trim()
                ? p.imageUrl
                : undefined,
            recommendedVehicle: p.recommendedVehicle || 'Moto',
            active: p.active !== false,
            createdAt:
              typeof p.createdAt === 'string'
                ? p.createdAt
                : new Date().toISOString(),
            updatedAt:
              typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
          })),
      };
    } catch {
      parsedStorefront = undefined;
    }
  }

  return {
    cleanLegalName: legalPart || undefined,
    storefront: parsedStorefront,
  };
}

export function encodeStorefrontMetaInCompanyName(
  cleanLegalName: string | undefined | null,
  storefront: MerchantStorefrontConfig | undefined
): string | null {
  const baseLegal = (cleanLegalName || '').trim();
  if (!storefront) {
    return baseLegal || null;
  }

  const compact: MerchantStorefrontConfig = {
    storeName: storefront.storeName?.trim() || undefined,
    storeDescription: storefront.storeDescription?.trim() || undefined,
    storeCep: storefront.storeCep?.trim() || undefined,
    storeAddress: storefront.storeAddress?.trim() || undefined,
    storeNeighborhood: storefront.storeNeighborhood?.trim() || undefined,
    storeLat:
      typeof storefront.storeLat === 'number' &&
      Number.isFinite(storefront.storeLat)
        ? storefront.storeLat
        : undefined,
    storeLng:
      typeof storefront.storeLng === 'number' &&
      Number.isFinite(storefront.storeLng)
        ? storefront.storeLng
        : undefined,
    products: (storefront.products || []).map((p) => ({
      id: p.id,
      name: p.name.trim(),
      description: p.description.trim(),
      price: Number(Math.max(0, p.price).toFixed(2)),
      imageUrl: p.imageUrl?.trim() || undefined,
      recommendedVehicle: p.recommendedVehicle,
      active: Boolean(p.active),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };

  const encoded = `${VITRINE_META_MARKER}${JSON.stringify(compact)}`;
  return baseLegal ? `${baseLegal}\n${encoded}` : encoded;
}

export function encodeStorefrontOrderTag(summary: StorefrontOrderSummary): string {
  return `[VORD:${encodeURIComponent(JSON.stringify(summary))}]`;
}

export function decodeStorefrontOrderTag(
  sourceChannel?: string | null
): StorefrontOrderSummary | undefined {
  if (!sourceChannel) return undefined;
  const match = sourceChannel.match(/\[VORD:([^\]]+)\]/);
  if (!match) return undefined;
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded) as StorefrontOrderSummary;
    if (!parsed || !Array.isArray(parsed.items)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function formatStorefrontItemsSummaryText(
  summary: StorefrontOrderSummary
): string {
  const itemsList = summary.items
    .map(
      (item) => `${item.quantity}x ${item.name} (${formatBRL(item.lineTotal)})`
    )
    .join(', ');
  const contactPart = summary.customerPhone
    ? ` · WhatsApp: ${summary.customerPhone}`
    : '';
  return `Pedido Vitrine: ${itemsList} · Produtos: ${formatBRL(
    summary.productsSubtotal
  )} · Frete: ${formatBRL(summary.freightTotal)} · Total: ${formatBRL(
    summary.grandTotal
  )}${contactPart}`;
}
