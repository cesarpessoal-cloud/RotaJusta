import { Order, OrderType, PropulsionType, VehicleType } from '../types';

export const VEHICLE_CATEGORIES: VehicleType[] = [
  'Bike',
  'Moto',
  'Carro Pequeno (Passeio)',
  'Utilitário / Picape / Van',
];

export function getPropulsionOptionsForVehicle(
  vehicleType?: VehicleType
): PropulsionType[] {
  if (vehicleType === 'Bike') {
    return [
      'Elétrica / Pedal Assistido (E-Bike)',
      'Propulsão Humana (Convencional)',
    ];
  }
  return ['Elétrico', 'Combustão'];
}

export const BIKE_RADIUS_OPTIONS: Array<{
  value: number | null;
  shortLabel: string;
  fullLabel: string;
}> = [
  { value: 3, shortLabel: '3 km', fullLabel: 'Até 3 km (Recomendado)' },
  { value: 5, shortLabel: '5 km', fullLabel: 'Até 5 km' },
  { value: 8, shortLabel: '8 km', fullLabel: 'Até 8 km' },
  { value: null, shortLabel: 'Sem limite', fullLabel: 'Sem limite' },
];

export function getEffectiveBikeRadiusKm(
  bikeMaxRadiusKm?: number | null
): number | null {
  if (bikeMaxRadiusKm === null) return null;
  if (typeof bikeMaxRadiusKm === 'number' && bikeMaxRadiusKm > 0) {
    return bikeMaxRadiusKm;
  }
  return 3; // Default recommended radius for Bike
}

export function getAllowedOrderTypesForVehicle(
  vehicleType?: VehicleType
): OrderType[] {
  switch (vehicleType) {
    case 'Bike':
      return ['rapida'];
    case 'Moto':
    case 'Carro Pequeno (Passeio)':
      return ['rapida', 'rota'];
    case 'Utilitário / Picape / Van':
      return ['frete', 'rota'];
    default:
      return ['rapida'];
  }
}

export function isOrderCompatibleWithVehicle(
  orderType: OrderType,
  vehicleType?: VehicleType,
  orderDistanceKm?: number,
  bikeMaxRadiusKm?: number | null,
  requestedVehicle?: VehicleType
): boolean {
  if (!vehicleType) {
    return false;
  }
  if (requestedVehicle && requestedVehicle !== vehicleType) {
    return false;
  }
  if (orderType === 'frete') {
    return vehicleType === 'Utilitário / Picape / Van';
  }
  if (!getAllowedOrderTypesForVehicle(vehicleType).includes(orderType)) {
    return false;
  }
  if (vehicleType === 'Bike' && orderType === 'rapida') {
    const effectiveRadius = getEffectiveBikeRadiusKm(bikeMaxRadiusKm);
    if (effectiveRadius !== null) {
      const dist = orderDistanceKm ?? 1;
      return dist <= effectiveRadius;
    }
  }
  return true;
}

export function getVehicleCompatibilityLabel(vehicleType?: VehicleType): string {
  switch (vehicleType) {
    case 'Bike':
      return 'Entrega Rápida';
    case 'Moto':
    case 'Carro Pequeno (Passeio)':
      return 'Entrega Rápida e Rota Consolidada';
    case 'Utilitário / Picape / Van':
      return 'Pequeno Frete (em destaque) e Rota Consolidada';
    default:
      return 'Entrega Rápida';
  }
}

export function sortCompatibleOrdersForVehicle(
  orders: Order[],
  vehicleType?: VehicleType,
  bikeMaxRadiusKm?: number | null
): Order[] {
  const filtered = orders.filter((order) =>
    isOrderCompatibleWithVehicle(
      order.type,
      vehicleType,
      order.distanceKm,
      bikeMaxRadiusKm,
      order.requestedVehicle
    )
  );

  if (vehicleType === 'Utilitário / Picape / Van') {
    return [...filtered].sort((a, b) => {
      if (a.type === 'frete' && b.type !== 'frete') return -1;
      if (a.type !== 'frete' && b.type === 'frete') return 1;
      return 0;
    });
  }

  return filtered;
}
