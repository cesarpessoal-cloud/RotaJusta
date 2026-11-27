import {
  CargoSize,
  Order,
  OrderType,
  PricingBreakdown,
  PropulsionType,
  VehicleType,
} from '../types';

export interface VehicleModalPricingRule {
  vehicleType: VehicleType;
  label: string;
  shortLabel: string;
  baseFare: number;
  baseKm: number;
  perKmRate: number;
  initialPlatformFee: number;
  rotaPerPackage: number;
  rotaInitialPlatformFeePerPackage: number;
}

export const CLEAN_MOBILITY_FEE_DISCOUNT_RATE = 0.5;

export const PROGRESSIVE_PLATFORM_FEE_NOTE =
  'Taxa operacional inicial da plataforma — reduz progressivamente conforme o volume da rede cresce (50% de desconto automático para bicicletas e veículos elétricos).';

export const VEHICLE_MODAL_PRICING: Record<
  VehicleType,
  VehicleModalPricingRule
> = {
  Bike: {
    vehicleType: 'Bike',
    label: 'Bicicleta / E-bike',
    shortLabel: 'Bike / E-bike',
    baseFare: 6.5,
    baseKm: 2,
    perKmRate: 1.1,
    initialPlatformFee: 0.4,
    rotaPerPackage: 3.2,
    rotaInitialPlatformFeePerPackage: 0.24,
  },
  Moto: {
    vehicleType: 'Moto',
    label: 'Moto',
    shortLabel: 'Moto',
    baseFare: 8.5,
    baseKm: 3,
    perKmRate: 1.4,
    initialPlatformFee: 0.8,
    rotaPerPackage: 3.8,
    rotaInitialPlatformFeePerPackage: 0.3,
  },
  'Carro Pequeno (Passeio)': {
    vehicleType: 'Carro Pequeno (Passeio)',
    label: 'Carro de Passeio',
    shortLabel: 'Carro Passeio',
    baseFare: 14.0,
    baseKm: 3,
    perKmRate: 2.2,
    initialPlatformFee: 1.5,
    rotaPerPackage: 5.2,
    rotaInitialPlatformFeePerPackage: 0.46,
  },
  'Utilitário / Picape / Van': {
    vehicleType: 'Utilitário / Picape / Van',
    label: 'Utilitário / Fiorino',
    shortLabel: 'Utilitário / Fiorino',
    baseFare: 80.0,
    baseKm: 5,
    perKmRate: 3.5,
    initialPlatformFee: 3.5,
    rotaPerPackage: 7.5,
    rotaInitialPlatformFeePerPackage: 0.6,
  },
};

export const PRICING_RULES = {
  RAPIDA_BASE: VEHICLE_MODAL_PRICING.Moto.baseFare,
  RAPIDA_BASE_KM: VEHICLE_MODAL_PRICING.Moto.baseKm,
  RAPIDA_EXTRA_KM_RATE: VEHICLE_MODAL_PRICING.Moto.perKmRate,
  RAPIDA_PLATFORM_FEE: VEHICLE_MODAL_PRICING.Moto.initialPlatformFee,
  ROTA_PER_PACKAGE: VEHICLE_MODAL_PRICING.Moto.rotaPerPackage,
  ROTA_PLATFORM_FEE_PER_PACKAGE:
    VEHICLE_MODAL_PRICING.Moto.rotaInitialPlatformFeePerPackage,
  FRETE_BASE: VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].baseFare,
  FRETE_BASE_KM: VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].baseKm,
  FRETE_EXTRA_KM_RATE:
    VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].perKmRate,
  FRETE_LARGE_CARGO_FEE: 25.0,
  FRETE_HELPER_FEE: 40.0,
  FRETE_PLATFORM_FEE:
    VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].initialPlatformFee,
  MOTORISTA_PASSE_DIARIO: 20.0,
} as const;

export function getDefaultVehicleForOrderType(type: OrderType): VehicleType {
  if (type === 'frete') return 'Utilitário / Picape / Van';
  return 'Moto';
}

export function getCompatibleVehiclesForOrderType(
  type: OrderType
): VehicleType[] {
  switch (type) {
    case 'rapida':
      return ['Bike', 'Moto', 'Carro Pequeno (Passeio)'];
    case 'rota':
      return ['Moto', 'Carro Pequeno (Passeio)', 'Utilitário / Picape / Van'];
    case 'frete':
      return ['Utilitário / Picape / Van'];
  }
}

export function getVehicleModalPricing(
  vehicleType?: VehicleType
): VehicleModalPricingRule {
  if (vehicleType && VEHICLE_MODAL_PRICING[vehicleType]) {
    return VEHICLE_MODAL_PRICING[vehicleType];
  }
  return VEHICLE_MODAL_PRICING.Moto;
}

export function formatVehicleModalDisplayName(
  vehicleType?: VehicleType
): string {
  if (!vehicleType) return 'Compatível com a modalidade';
  return VEHICLE_MODAL_PRICING[vehicleType]?.label || vehicleType;
}

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
  freightOptions?: FreightPricingOptions,
  vehicleType?: VehicleType
): PricingBreakdown {
  const resolvedVehicle = vehicleType || getDefaultVehicleForOrderType(type);
  const modal = getVehicleModalPricing(resolvedVehicle);

  if (type === 'rapida') {
    const safeDistance = Math.max(1, distanceKm || 1);
    const extraKm = Math.max(0, roundCurrency(safeDistance - modal.baseKm));
    const baseComponent = modal.baseFare;
    const extraDistanceComponent = roundCurrency(extraKm * modal.perKmRate);
    const grossTotal = roundCurrency(baseComponent + extraDistanceComponent);
    const standardPlatformFee = modal.initialPlatformFee;
    const basePayout = roundCurrency(grossTotal - standardPlatformFee);
    const evDiscountedFee = roundCurrency(
      standardPlatformFee * (1 - CLEAN_MOBILITY_FEE_DISCOUNT_RATE)
    );
    const evBonus = roundCurrency(standardPlatformFee - evDiscountedFee);
    const evNetPayout = roundCurrency(grossTotal - evDiscountedFee);

    return {
      vehicleCategory: resolvedVehicle,
      baseKm: modal.baseKm,
      perKmRate: modal.perKmRate,
      perPackageRate: modal.rotaPerPackage,
      perPackageFee: modal.rotaInitialPlatformFeePerPackage,
      grossTotal,
      baseComponent,
      extraDistanceComponent,
      extraKm,
      cargoSizeComponent: 0,
      helperComponent: 0,
      standardPlatformFee,
      basePayout,
      evDiscountedFee,
      evBonus,
      evNetPayout,
      combustionPlatformFee: standardPlatformFee,
      combustionNetPayout: basePayout,
    };
  }

  if (type === 'frete') {
    const freteModal = getVehicleModalPricing(
      vehicleType || 'Utilitário / Picape / Van'
    );
    const safeDistance = Math.max(1, distanceKm || 1);
    const extraKm = Math.max(
      0,
      roundCurrency(safeDistance - freteModal.baseKm)
    );
    const baseComponent = freteModal.baseFare;
    const extraDistanceComponent = roundCurrency(
      extraKm * freteModal.perKmRate
    );
    const cargoSizeComponent =
      freightOptions?.cargoSize === 'grande'
        ? PRICING_RULES.FRETE_LARGE_CARGO_FEE
        : 0;
    const helperComponent = freightOptions?.includeHelper
      ? PRICING_RULES.FRETE_HELPER_FEE
      : 0;
    const grossTotal = roundCurrency(
      baseComponent +
        extraDistanceComponent +
        cargoSizeComponent +
        helperComponent
    );
    const standardPlatformFee = freteModal.initialPlatformFee;
    const basePayout = roundCurrency(grossTotal - standardPlatformFee);
    const evDiscountedFee = roundCurrency(
      standardPlatformFee * (1 - CLEAN_MOBILITY_FEE_DISCOUNT_RATE)
    );
    const evBonus = roundCurrency(standardPlatformFee - evDiscountedFee);
    const evNetPayout = roundCurrency(grossTotal - evDiscountedFee);

    return {
      vehicleCategory: freteModal.vehicleType,
      baseKm: freteModal.baseKm,
      perKmRate: freteModal.perKmRate,
      perPackageRate: freteModal.rotaPerPackage,
      perPackageFee: freteModal.rotaInitialPlatformFeePerPackage,
      grossTotal,
      baseComponent,
      extraDistanceComponent,
      extraKm,
      cargoSizeComponent,
      helperComponent,
      standardPlatformFee,
      basePayout,
      evDiscountedFee,
      evBonus,
      evNetPayout,
      combustionPlatformFee: standardPlatformFee,
      combustionNetPayout: basePayout,
    };
  }

  const safePackages = Math.max(1, Math.floor(packageCount || 1));
  const grossTotal = roundCurrency(safePackages * modal.rotaPerPackage);
  const standardPlatformFee = roundCurrency(
    safePackages * modal.rotaInitialPlatformFeePerPackage
  );
  const basePayout = roundCurrency(grossTotal - standardPlatformFee);
  const evDiscountedFee = roundCurrency(
    standardPlatformFee * (1 - CLEAN_MOBILITY_FEE_DISCOUNT_RATE)
  );
  const evBonus = roundCurrency(standardPlatformFee - evDiscountedFee);
  const evNetPayout = roundCurrency(grossTotal - evDiscountedFee);

  return {
    vehicleCategory: resolvedVehicle,
    baseKm: modal.baseKm,
    perKmRate: modal.perKmRate,
    perPackageRate: modal.rotaPerPackage,
    perPackageFee: modal.rotaInitialPlatformFeePerPackage,
    grossTotal,
    baseComponent: grossTotal,
    extraDistanceComponent: 0,
    extraKm: 0,
    cargoSizeComponent: 0,
    helperComponent: 0,
    standardPlatformFee,
    basePayout,
    evDiscountedFee,
    evBonus,
    evNetPayout,
    combustionPlatformFee: standardPlatformFee,
    combustionNetPayout: basePayout,
  };
}

export function hasCleanMobilityDiscount(
  propulsion?: PropulsionType,
  vehicleType?: VehicleType
): boolean {
  if (vehicleType === 'Bike') {
    return true;
  }
  return (
    propulsion === 'Elétrico' ||
    propulsion === 'Propulsão Humana (Convencional)' ||
    propulsion === 'Elétrica / Pedal Assistido (E-Bike)'
  );
}

export function isZeroFeePropulsion(
  propulsion?: PropulsionType,
  vehicleType?: VehicleType
): boolean {
  return hasCleanMobilityDiscount(propulsion, vehicleType);
}

export function getCourierSettlementForOrder(
  order: Pick<Order, 'grossTotal' | 'standardPlatformFee' | 'basePayout'>,
  propulsion: PropulsionType,
  vehicleType?: VehicleType
): {
  platformFee: number;
  evBonus: number;
  netPayout: number;
  hasDiscount: boolean;
} {
  if (hasCleanMobilityDiscount(propulsion, vehicleType)) {
    const discountedFee = roundCurrency(
      order.standardPlatformFee * (1 - CLEAN_MOBILITY_FEE_DISCOUNT_RATE)
    );
    const discountAmount = roundCurrency(
      order.standardPlatformFee - discountedFee
    );
    return {
      platformFee: discountedFee,
      evBonus: discountAmount,
      netPayout: roundCurrency(order.grossTotal - discountedFee),
      hasDiscount: true,
    };
  }

  return {
    platformFee: order.standardPlatformFee,
    evBonus: 0,
    netPayout: order.basePayout,
    hasDiscount: false,
  };
}
