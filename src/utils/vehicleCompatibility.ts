import {
  Order,
  OrderType,
  Profile,
  PropulsionType,
  UserRole,
  VehicleType,
} from '../types';

export const VEHICLE_CATEGORIES: VehicleType[] = [
  'Bike',
  'Moto',
  'Carro Pequeno (Passeio)',
  'Utilitário / Picape / Van',
];

export type OnlineCourierCountsByVehicle = Record<VehicleType, number>;

export function createEmptyOnlineCountsByVehicle(): OnlineCourierCountsByVehicle {
  return {
    Bike: 0,
    Moto: 0,
    'Carro Pequeno (Passeio)': 0,
    'Utilitário / Picape / Van': 0,
  };
}

export function normalizeCourierVehicleCategory(
  vehicleType?: string | null,
  role?: UserRole | string | null
): VehicleType {
  if (vehicleType === 'Bike') return 'Bike';
  if (vehicleType === 'Moto') return 'Moto';
  if (vehicleType === 'Carro Pequeno (Passeio)') {
    return 'Carro Pequeno (Passeio)';
  }
  if (vehicleType === 'Utilitário / Picape / Van') {
    return 'Utilitário / Picape / Van';
  }
  if (vehicleType === 'Carro/Utilitário') {
    return role === 'motorista'
      ? 'Carro Pequeno (Passeio)'
      : 'Utilitário / Picape / Van';
  }
  return role === 'motorista' ? 'Carro Pequeno (Passeio)' : 'Moto';
}

export function countOnlineCouriersByVehicle(
  couriers: Profile[]
): OnlineCourierCountsByVehicle {
  const counts = createEmptyOnlineCountsByVehicle();
  for (const courier of couriers) {
    const isCourierRole =
      courier.role === 'entregador' || courier.role === 'motorista';
    if (!isCourierRole) continue;
    if (courier.approvalStatus !== 'Aprovado') continue;
    if (!courier.isOnline) continue;
    const category = normalizeCourierVehicleCategory(
      courier.vehicleType,
      courier.role
    );
    counts[category] += 1;
  }
  return counts;
}

export function getTotalOnlineCouriersFromMap(
  counts: OnlineCourierCountsByVehicle
): number {
  return VEHICLE_CATEGORIES.reduce((sum, cat) => sum + (counts[cat] || 0), 0);
}

export function getNextSuperiorVehicle(
  currentVehicle: VehicleType,
  allowedVehicles?: VehicleType[]
): VehicleType | null {
  const startIdx = VEHICLE_CATEGORIES.indexOf(currentVehicle);
  if (startIdx < 0) return null;
  for (let i = startIdx + 1; i < VEHICLE_CATEGORIES.length; i += 1) {
    const candidate = VEHICLE_CATEGORIES[i];
    if (!allowedVehicles || allowedVehicles.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getNextAvailableSuperiorVehicle(
  currentVehicle: VehicleType,
  onlineCounts: OnlineCourierCountsByVehicle,
  allowedVehicles?: VehicleType[]
): VehicleType | null {
  const startIdx = VEHICLE_CATEGORIES.indexOf(currentVehicle);
  if (startIdx < 0) return null;
  for (let i = startIdx + 1; i < VEHICLE_CATEGORIES.length; i += 1) {
    const candidate = VEHICLE_CATEGORIES[i];
    if (allowedVehicles && !allowedVehicles.includes(candidate)) continue;
    if ((onlineCounts[candidate] || 0) > 0) {
      return candidate;
    }
  }
  return null;
}

export function resolveVehicleWithOnlineFallback(params: {
  preferredVehicle: VehicleType;
  onlineCounts: OnlineCourierCountsByVehicle;
  allowedVehicles?: VehicleType[];
}): {
  selectedVehicle: VehicleType;
  wasPreferredUnavailable: boolean;
  hasAnyAvailableInAllowed: boolean;
  totalOnlineAll: number;
} {
  const allowed =
    params.allowedVehicles && params.allowedVehicles.length > 0
      ? params.allowedVehicles
      : VEHICLE_CATEGORIES;
  const totalOnlineAll = getTotalOnlineCouriersFromMap(params.onlineCounts);
  const preferred = allowed.includes(params.preferredVehicle)
    ? params.preferredVehicle
    : allowed[0];

  if ((params.onlineCounts[preferred] || 0) > 0) {
    return {
      selectedVehicle: preferred,
      wasPreferredUnavailable: false,
      hasAnyAvailableInAllowed: true,
      totalOnlineAll,
    };
  }

  const nextSuperior = getNextAvailableSuperiorVehicle(
    preferred,
    params.onlineCounts,
    allowed
  );
  if (nextSuperior) {
    return {
      selectedVehicle: nextSuperior,
      wasPreferredUnavailable: true,
      hasAnyAvailableInAllowed: true,
      totalOnlineAll,
    };
  }

  const anyAvailable = allowed.find((v) => (params.onlineCounts[v] || 0) > 0);
  if (anyAvailable) {
    return {
      selectedVehicle: anyAvailable,
      wasPreferredUnavailable: true,
      hasAnyAvailableInAllowed: true,
      totalOnlineAll,
    };
  }

  return {
    selectedVehicle: preferred,
    wasPreferredUnavailable: true,
    hasAnyAvailableInAllowed: false,
    totalOnlineAll,
  };
}

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
  if (
    orderType === 'rapida' &&
    requestedVehicle === 'Utilitário / Picape / Van'
  ) {
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
