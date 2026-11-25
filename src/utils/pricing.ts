import { CargoSize, Order, OrderType, PricingBreakdown, PropulsionType } from '../types';

export const PRICING_RULES = {
  RAPIDA_BASE: 7.5,
  RAPIDA_BASE_KM: 3,
  RAPIDA_EXTRA_KM_RATE: 1.2,
  RAPIDA_PLATFORM_FEE: 0.5,
  ROTA_PER_PACKAGE: 3.6,
  ROTA_PLATFORM_FEE_PER_PACKAGE: 0.3,
  FRETE_BASE: 80.0,
  FRETE_BASE_KM: 5,
  FRETE_EXTRA_KM_RATE: 3.5,
  FRETE_LARGE_CARGO_FEE: 25.0,
  FRETE_HELPER_FEE: 40.0,
  FRETE_PLATFORM_FEE: 3.0,
  MOTORISTA_PASSE_DIARIO: 20.0,
} as const;

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateTimeBR(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface FreightPricingOptions {
  cargoSize: CargoSize;
  includeHelper: boolean;
}

export function calculatePricing(
  type: OrderType,
  distanceKm: number,
  packageCount: number,
  freightOptions?: FreightPricingOptions
): PricingBreakdown {
  if (type === 'rapida') {
    const safeDistance = Math.max(1, distanceKm || 1);
    const extraKm = Math.max(0, roundCurrency(safeDistance - PRICING_RULES.RAPIDA_BASE_KM));
    const baseComponent = PRICING_RULES.RAPIDA_BASE;
    const extraDistanceComponent = roundCurrency(extraKm * PRICING_RULES.RAPIDA_EXTRA_KM_RATE);
    const grossTotal = roundCurrency(baseComponent + extraDistanceComponent);
    const standardPlatformFee = PRICING_RULES.RAPIDA_PLATFORM_FEE;
    const basePayout = roundCurrency(grossTotal - standardPlatformFee);
    const evBonus = standardPlatformFee;
    const evNetPayout = grossTotal;

    return {
      grossTotal,
      baseComponent,
      extraDistanceComponent,
      extraKm,
      cargoSizeComponent: 0,
      helperComponent: 0,
      standardPlatformFee,
      basePayout,
      evBonus,
      evNetPayout,
      combustionPlatformFee: standardPlatformFee,
      combustionNetPayout: basePayout,
    };
  }

  if (type === 'frete') {
    const safeDistance = Math.max(1, distanceKm || 1);
    const extraKm = Math.max(0, roundCurrency(safeDistance - PRICING_RULES.FRETE_BASE_KM));
    const baseComponent = PRICING_RULES.FRETE_BASE;
    const extraDistanceComponent = roundCurrency(extraKm * PRICING_RULES.FRETE_EXTRA_KM_RATE);
    const cargoSizeComponent =
      freightOptions?.cargoSize === 'grande' ? PRICING_RULES.FRETE_LARGE_CARGO_FEE : 0;
    const helperComponent = freightOptions?.includeHelper ? PRICING_RULES.FRETE_HELPER_FEE : 0;
    const grossTotal = roundCurrency(
      baseComponent + extraDistanceComponent + cargoSizeComponent + helperComponent
    );
    const standardPlatformFee = PRICING_RULES.FRETE_PLATFORM_FEE;
    const basePayout = roundCurrency(grossTotal - standardPlatformFee);
    const evBonus = standardPlatformFee;
    const evNetPayout = grossTotal;

    return {
      grossTotal,
      baseComponent,
      extraDistanceComponent,
      extraKm,
      cargoSizeComponent,
      helperComponent,
      standardPlatformFee,
      basePayout,
      evBonus,
      evNetPayout,
      combustionPlatformFee: standardPlatformFee,
      combustionNetPayout: basePayout,
    };
  }

  const safePackages = Math.max(1, Math.floor(packageCount || 1));
  const grossTotal = roundCurrency(safePackages * PRICING_RULES.ROTA_PER_PACKAGE);
  const standardPlatformFee = roundCurrency(
    safePackages * PRICING_RULES.ROTA_PLATFORM_FEE_PER_PACKAGE
  );
  const basePayout = roundCurrency(grossTotal - standardPlatformFee);
  const evBonus = standardPlatformFee;
  const evNetPayout = grossTotal;

  return {
    grossTotal,
    baseComponent: grossTotal,
    extraDistanceComponent: 0,
    extraKm: 0,
    cargoSizeComponent: 0,
    helperComponent: 0,
    standardPlatformFee,
    basePayout,
    evBonus,
    evNetPayout,
    combustionPlatformFee: standardPlatformFee,
    combustionNetPayout: basePayout,
  };
}

export function isZeroFeePropulsion(propulsion?: PropulsionType): boolean {
  return (
    propulsion === 'Elétrico' ||
    propulsion === 'Propulsão Humana (Convencional)' ||
    propulsion === 'Elétrica / Pedal Assistido (E-Bike)'
  );
}

export function getCourierSettlementForOrder(
  order: Pick<Order, 'grossTotal' | 'standardPlatformFee' | 'basePayout'>,
  propulsion: PropulsionType
): {
  platformFee: number;
  evBonus: number;
  netPayout: number;
} {
  if (isZeroFeePropulsion(propulsion)) {
    return {
      platformFee: 0,
      evBonus: order.standardPlatformFee,
      netPayout: order.grossTotal,
    };
  }

  return {
    platformFee: order.standardPlatformFee,
    evBonus: 0,
    netPayout: order.basePayout,
  };
}
