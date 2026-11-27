import { resolvePortoAlegreCoordinates } from '../constants/portoAlegre';
import {
  ApprovalStatus,
  CargoSize,
  CourierQuickNotice,
  CourierQuickNoticeType,
  DeliveryStop,
  MerchantStorefrontConfig,
  Order,
  OrderFlowDirection,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PersonType,
  PickupSchedule,
  PickupScheduleMode,
  PixPaymentMethod,
  Profile,
  PropulsionType,
  Rating,
  UserRole,
  VehicleType,
} from '../types';
import { formatCpfOrCnpj, onlyDigits } from '../utils/documentValidation';
import { isValidEmail, normalizeEmail } from '../utils/emailValidation';
import { formatPickupCode } from '../utils/pickupCode';
import { calculatePricing } from '../utils/pricing';
import {
  buildCourierQuickNotice,
  isCourierQuickNoticeType,
} from '../utils/quickNotice';
import {
  decodeStorefrontMetaFromCompanyName,
  decodeStorefrontOrderTag,
  encodeStorefrontMetaInCompanyName,
  encodeStorefrontOrderTag,
  formatStorefrontItemsSummaryText,
} from '../utils/storefront';
import { normalizePlateForDisplay } from '../utils/courierIdentity';
import { verifyTotpCode } from '../utils/totp';
import { supabase } from './supabase';

export type DbApprovalStatus = 'pendente' | 'aprovado' | 'bloqueado';
export type DbDeliveryStatus = 'aguardando' | 'em_rota' | 'entregue';
export type DbStopStatus = 'pendente' | 'entregue';

interface DbProfileRow {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  accepts_marketing?: boolean | null;
  pix_key?: string | null;
  person_type?: string | null;
  document_number?: string | null;
  company_legal_name?: string | null;
  role: UserRole;
  avatar_url?: string | null;
  vehicle_type: string | null;
  propulsion: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_plate?: string | null;
  max_radius_km: number | null;
  cnh_ear?: boolean | null;
  status: string;
  two_factor_enabled?: boolean | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  is_online?: boolean | null;
  created_at?: string | null;
}

interface DbRatingRow {
  id: string;
  delivery_id: string;
  from_profile_id: string;
  to_profile_id: string;
  stars: number;
  comment: string | null;
  created_at?: string | null;
}

interface DbDeliveryRow {
  id: string;
  type: OrderType;
  pickup_address: string;
  delivery_region: string;
  distance_km: number | null;
  package_count: number | null;
  cargo_description: string | null;
  cargo_size: string | null;
  has_helper: boolean | null;
  access_notes: string | null;
  driver_payout: number | null;
  platform_fee: number | null;
  total_price: number | null;
  status: string;
  payment_method?: string | null;
  payment_status?: string | null;
  request_direction?: string | null;
  pickup_scheduled_at?: string | null;
  pickup_deadline_at?: string | null;
  courier_notice?: string | null;
  courier_notice_at?: string | null;
  driver_id: string | null;
  driver_name: string | null;
  source_channel: string | null;
  created_at?: string | null;
}

interface DbDeliveryStopRow {
  id: string;
  delivery_id: string;
  stop_order: number;
  address: string;
  neighborhood: string;
  recipient_name: string | null;
  notes: string | null;
  status: string;
  delivered_at: string | null;
  proof_recipient: string | null;
  proof_photo_base64: string | null;
}

export function mapDbStatusToApproval(status?: string | null): ApprovalStatus {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'aprovado' || normalized === 'aprovada') return 'Aprovado';
  if (normalized === 'bloqueado' || normalized === 'bloqueada') return 'Bloqueado';
  return 'Aguardando Aprovação';
}

export function mapApprovalToDbStatus(status: ApprovalStatus): DbApprovalStatus {
  if (status === 'Aprovado') return 'aprovado';
  if (status === 'Bloqueado') return 'bloqueado';
  return 'pendente';
}

export function mapDbStatusToOrderStatus(status?: string | null): OrderStatus {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'em_rota' || normalized === 'em rota') return 'Em Rota';
  if (
    normalized === 'entregue' ||
    normalized === 'concluido' ||
    normalized === 'concluído'
  ) {
    return 'Entregue';
  }
  return 'Aguardando';
}

function extractNeighborhoodFromAddress(rawAddress: string): {
  address: string;
  neighborhood: string;
} {
  const match = rawAddress.match(/^(.*)\(([^)]+)\)\s*$/);
  if (match) {
    const cleanAddr = match[1].trim();
    const nb = match[2].trim();
    const resolved = resolvePortoAlegreCoordinates(cleanAddr, nb, 0);
    return {
      address: cleanAddr || rawAddress,
      neighborhood: resolved.matchedNeighborhood,
    };
  }
  const resolved = resolvePortoAlegreCoordinates(
    rawAddress,
    'Centro Histórico',
    0
  );
  return {
    address: rawAddress,
    neighborhood: resolved.matchedNeighborhood,
  };
}

function formatDeliveryCode(id: string): string {
  return formatPickupCode(id);
}

const COURIER_ID_META_PREFIX = '__RJ_ID__:';

interface CourierIdentityFallbackMeta {
  a?: string;
  m?: string;
  c?: string;
  p?: string;
}

function encodeCourierIdentityMeta(
  meta: CourierIdentityFallbackMeta
): string | null {
  const compact: CourierIdentityFallbackMeta = {};
  if (meta.a) compact.a = meta.a;
  if (meta.m) compact.m = meta.m;
  if (meta.c) compact.c = meta.c;
  if (meta.p) compact.p = meta.p;
  if (Object.keys(compact).length === 0) return null;
  return `${COURIER_ID_META_PREFIX}${JSON.stringify(compact)}`;
}

function decodeCourierIdentityMeta(
  raw?: string | null
): CourierIdentityFallbackMeta | null {
  if (!raw || !raw.startsWith(COURIER_ID_META_PREFIX)) return null;
  try {
    return JSON.parse(
      raw.slice(COURIER_ID_META_PREFIX.length)
    ) as CourierIdentityFallbackMeta;
  } catch {
    return null;
  }
}

function normalizeProfileFromRow(row: DbProfileRow): Profile {
  let vehicleType = (row.vehicle_type || undefined) as VehicleType | undefined;
  let propulsion = (row.propulsion || undefined) as PropulsionType | undefined;

  if ((row.vehicle_type as string) === 'Carro/Utilitário') {
    vehicleType =
      row.role === 'motorista'
        ? 'Carro Pequeno (Passeio)'
        : 'Utilitário / Picape / Van';
  }

  let bikeMaxRadiusKm: number | null | undefined = undefined;
  if (vehicleType === 'Bike') {
    bikeMaxRadiusKm =
      row.max_radius_km === undefined ? 3 : row.max_radius_km;

    if (propulsion === 'Elétrico') {
      propulsion = 'Elétrica / Pedal Assistido (E-Bike)';
    } else if (propulsion === 'Combustão') {
      propulsion = 'Propulsão Humana (Convencional)';
    }
  }

  const resolvedPersonType: PersonType | undefined =
    row.person_type === 'PJ'
      ? 'PJ'
      : row.person_type === 'PF'
      ? 'PF'
      : undefined;
  const docDigits = row.document_number
    ? onlyDigits(row.document_number)
    : '';
  const formattedDoc = formatCpfOrCnpj(docDigits, resolvedPersonType);

  const fallbackMeta = decodeCourierIdentityMeta(row.company_legal_name);
  const { cleanLegalName, storefront } = fallbackMeta
    ? { cleanLegalName: undefined, storefront: undefined }
    : decodeStorefrontMetaFromCompanyName(row.company_legal_name);

  const resolvedAvatar = row.avatar_url || fallbackMeta?.a || undefined;
  const resolvedModel = row.vehicle_model || fallbackMeta?.m || undefined;
  const resolvedColor = row.vehicle_color || fallbackMeta?.c || undefined;
  const resolvedPlate =
    normalizePlateForDisplay(row.vehicle_plate || fallbackMeta?.p) || undefined;

  return {
    id: row.id,
    role: row.role || 'entregador',
    personType: resolvedPersonType,
    name: row.name,
    companyLegalName: cleanLegalName,
    businessName:
      storefront?.storeName ||
      (resolvedPersonType === 'PJ' ? cleanLegalName || row.name : undefined),
    document: formattedDoc,
    documentNumber: docDigits || undefined,
    phone: row.phone || '',
    email: row.email || undefined,
    acceptsMarketing: Boolean(row.accepts_marketing),
    pixKey: row.pix_key || undefined,
    neighborhood: storefront?.storeNeighborhood || 'Porto Alegre',
    address: storefront?.storeAddress || undefined,
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    avatarUrl: resolvedAvatar,
    vehicleType,
    propulsion,
    vehicleModel: resolvedModel,
    vehicleColor: resolvedColor,
    plate: resolvedPlate,
    hasEar: Boolean(row.cnh_ear),
    dailyPassInterest: row.role === 'motorista',
    bikeMaxRadiusKm,
    ratingAvg:
      row.rating_avg !== null && row.rating_avg !== undefined
        ? Number(row.rating_avg)
        : 0,
    ratingCount:
      row.rating_count !== null && row.rating_count !== undefined
        ? Number(row.rating_count)
        : 0,
    isOnline: Boolean(row.is_online),
    approvalStatus: mapDbStatusToApproval(row.status),
    storefront,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function normalizeStopFromRow(
  row: DbDeliveryStopRow,
  fallbackNeighborhood: string
): DeliveryStop {
  const coords = resolvePortoAlegreCoordinates(
    row.address,
    row.neighborhood || fallbackNeighborhood,
    row.stop_order
  );

  return {
    id: row.id,
    pickupCode: formatPickupCode(row.id),
    sequence: row.stop_order,
    address: row.address,
    neighborhood: row.neighborhood || fallbackNeighborhood,
    expectedRecipient: row.recipient_name || undefined,
    recipientNote: row.notes || undefined,
    lat: coords.lat,
    lng: coords.lng,
    delivered: (row.status || '').toLowerCase() === 'entregue',
    receiverName: row.proof_recipient || undefined,
    proofPhotoDataUrl: row.proof_photo_base64 || undefined,
    deliveredAt: row.delivered_at || undefined,
  };
}

function encodeVehicleTag(vehicleType?: VehicleType): string | null {
  switch (vehicleType) {
    case 'Bike':
      return 'bike';
    case 'Moto':
      return 'moto';
    case 'Carro Pequeno (Passeio)':
      return 'carro';
    case 'Utilitário / Picape / Van':
      return 'utilitario';
    default:
      return null;
  }
}

function decodeVehicleTag(tag?: string): VehicleType | undefined {
  switch ((tag || '').toLowerCase()) {
    case 'bike':
      return 'Bike';
    case 'moto':
      return 'Moto';
    case 'carro':
      return 'Carro Pequeno (Passeio)';
    case 'utilitario':
      return 'Utilitário / Picape / Van';
    default:
      return undefined;
  }
}

function normalizeOrderFromRows(
  row: DbDeliveryRow,
  stopRows: DbDeliveryStopRow[],
  profileById: Map<string, Profile>
): Order {
  const parsedPickup = extractNeighborhoodFromAddress(row.pickup_address);
  const pickupCoords = resolvePortoAlegreCoordinates(
    parsedPickup.address,
    parsedPickup.neighborhood,
    0
  );

  const stops = stopRows
    .slice()
    .sort((a, b) => a.stop_order - b.stop_order)
    .map((s) => normalizeStopFromRow(s, row.delivery_region));

  const packageCount = row.package_count ?? Math.max(1, stops.length);
  const cargoSize: CargoSize =
    row.cargo_size === 'grande' ? 'grande' : 'medio';
  const includeHelper = Boolean(row.has_helper);

  const rawSource = row.source_channel || 'Lojista Porto Alegre';
  const vehMatch = rawSource.match(/\[VEH:(bike|moto|carro|utilitario)\]/i);
  const extractedVehicle = decodeVehicleTag(vehMatch?.[1]);

  const computedPricing = calculatePricing(
    row.type,
    row.distance_km ?? 1,
    packageCount,
    {
      cargoSize,
      includeHelper,
    },
    extractedVehicle
  );

  const orderStatus = mapDbStatusToOrderStatus(row.status);
  const assignedDriver = row.driver_id
    ? profileById.get(row.driver_id)
    : undefined;
  const appliedFee =
    row.platform_fee !== null && row.platform_fee !== undefined
      ? Number(row.platform_fee)
      : computedPricing.standardPlatformFee;
  const driverPayout =
    row.driver_payout !== null && row.driver_payout !== undefined
      ? Number(row.driver_payout)
      : computedPricing.basePayout;

  const evBonusApplied =
    orderStatus !== 'Aguardando'
      ? Math.max(
          0,
          Number((computedPricing.standardPlatformFee - appliedFee).toFixed(2))
        )
      : undefined;

  const hasPlatformTag = rawSource.includes('[PIX:plataforma]');
  const uidMatch = rawSource.match(/\[UID:([a-zA-Z0-9-]+)\]/);
  const extractedMerchantId = uidMatch?.[1] || '';

  const dirMatch = rawSource.match(/\[DIR:(enviar|receber)\]/);
  const extractedFlowDirection: OrderFlowDirection | undefined =
    row.request_direction === 'receive'
      ? 'receber'
      : row.request_direction === 'send'
      ? 'enviar'
      : dirMatch?.[1] === 'receber'
      ? 'receber'
      : dirMatch?.[1] === 'enviar'
      ? 'enviar'
      : undefined;

  const agdMatch = rawSource.match(/\[AGD:([^|\]]*)\|([^|\]]*)\|([^\]]*)\]/);
  let extractedSchedule: PickupSchedule | undefined;
  if (row.pickup_scheduled_at || row.pickup_deadline_at) {
    extractedSchedule = {
      mode: row.pickup_scheduled_at ? 'agendada' : 'imediata',
      readyAt: row.pickup_scheduled_at || undefined,
      deadlineAt: row.pickup_deadline_at || undefined,
    };
  } else if (agdMatch) {
    const mode: PickupScheduleMode =
      agdMatch[1] === 'agendada' ? 'agendada' : 'imediata';
    extractedSchedule = {
      mode,
      readyAt: agdMatch[2] || undefined,
      deadlineAt: agdMatch[3] || undefined,
    };
  }

  const avisoMatch = rawSource.match(
    /\[AVISO:([^|\]]+)\|([^|\]]*)(?:\|([^\]]*))?\]/
  );
  const parsedAvisoStopSeq = avisoMatch?.[3]
    ? Number(avisoMatch[3])
    : undefined;
  const safeAvisoStopSeq =
    parsedAvisoStopSeq && !Number.isNaN(parsedAvisoStopSeq)
      ? parsedAvisoStopSeq
      : undefined;

  const historyEvents: CourierQuickNotice[] = [];
  const evtRegex = /\[EVT:([^|\]]+)\|([^|\]]*)(?:\|([^\]]*))?\]/g;
  let evtMatch: RegExpExecArray | null;
  while ((evtMatch = evtRegex.exec(rawSource)) !== null) {
    const evtType = evtMatch[1];
    const evtAt = evtMatch[2] || row.created_at || new Date().toISOString();
    const evtSeqRaw = evtMatch[3] ? Number(evtMatch[3]) : undefined;
    const evtSeq =
      evtSeqRaw && !Number.isNaN(evtSeqRaw) ? evtSeqRaw : undefined;
    if (isCourierQuickNoticeType(evtType)) {
      historyEvents.push(buildCourierQuickNotice(evtType, evtAt, evtSeq));
    }
  }

  let extractedQuickNotice: CourierQuickNotice | undefined;
  if (isCourierQuickNoticeType(row.courier_notice)) {
    extractedQuickNotice = buildCourierQuickNotice(
      row.courier_notice,
      row.courier_notice_at ||
        avisoMatch?.[2] ||
        row.created_at ||
        new Date().toISOString(),
      safeAvisoStopSeq
    );
  } else if (avisoMatch && isCourierQuickNoticeType(avisoMatch[1])) {
    extractedQuickNotice = buildCourierQuickNotice(
      avisoMatch[1],
      avisoMatch[2] || row.created_at || new Date().toISOString(),
      safeAvisoStopSeq
    );
  } else if (historyEvents.length > 0) {
    extractedQuickNotice = historyEvents[historyEvents.length - 1];
  }

  if (
    extractedQuickNotice &&
    !historyEvents.some(
      (e) =>
        e.type === extractedQuickNotice!.type &&
        e.updatedAt === extractedQuickNotice!.updatedAt
    )
  ) {
    historyEvents.push(extractedQuickNotice);
  }

  historyEvents.sort(
    (a, b) =>
      new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  );

  const extractedStorefrontOrder = decodeStorefrontOrderTag(rawSource);

  const cleanMerchantName =
    rawSource
      .replace(/\s*\[PIX:(?:plataforma|direto)\]/g, '')
      .replace(/\s*\[UID:[a-zA-Z0-9-]+\]/g, '')
      .replace(/\s*\[DIR:(?:enviar|receber)\]/g, '')
      .replace(/\s*\[VEH:(?:bike|moto|carro|utilitario)\]/gi, '')
      .replace(/\s*\[AGD:[^\]]*\]/g, '')
      .replace(/\s*\[AVISO:[^\]]*\]/g, '')
      .replace(/\s*\[EVT:[^\]]*\]/g, '')
      .replace(/\s*\[VORD:[^\]]*\]/g, '')
      .trim() || 'Lojista Porto Alegre';

  let merchantProfile = extractedMerchantId
    ? profileById.get(extractedMerchantId)
    : undefined;
  if (!merchantProfile) {
    const cleanLower = cleanMerchantName.toLowerCase();
    for (const candidate of profileById.values()) {
      if (candidate.role !== 'lojista' && candidate.role !== 'admin') continue;
      if (
        candidate.name.toLowerCase() === cleanLower ||
        candidate.businessName?.toLowerCase() === cleanLower ||
        candidate.companyLegalName?.toLowerCase() === cleanLower
      ) {
        merchantProfile = candidate;
        break;
      }
    }
  }

  const resolvedPaymentMethod: PixPaymentMethod =
    row.payment_method === 'pix_plataforma' || hasPlatformTag
      ? 'pix_plataforma'
      : 'pix_direto';

  const rawPaymentStatus = (row.payment_status || '').toLowerCase();
  const resolvedPaymentStatus: PaymentStatus =
    rawPaymentStatus === 'repassado'
      ? 'repassado'
      : rawPaymentStatus === 'pago_lojista'
      ? 'pago_lojista'
      : 'pendente_pagamento';

  return {
    id: row.id,
    code: formatDeliveryCode(row.id),
    type: row.type,
    requestedVehicle: extractedVehicle,
    flowDirection: extractedFlowDirection,
    pickupSchedule: extractedSchedule,
    merchantId: merchantProfile?.id || extractedMerchantId || '',
    merchantName: cleanMerchantName,
    merchantPhone: merchantProfile?.phone || undefined,
    merchantRatingAvg: merchantProfile?.ratingAvg,
    merchantRatingCount: merchantProfile?.ratingCount,
    pickupAddress: parsedPickup.address,
    pickupNeighborhood: parsedPickup.neighborhood,
    pickupLat: pickupCoords.lat,
    pickupLng: pickupCoords.lng,
    destinationNeighborhood: row.delivery_region,
    distanceKm:
      row.distance_km !== null && row.distance_km !== undefined
        ? Number(row.distance_km)
        : undefined,
    packageCount,
    freightDetails:
      row.type === 'frete'
        ? {
            cargoDescription: row.cargo_description || 'Frete utilitário POA',
            cargoSize,
            includeHelper,
            accessNote: row.access_notes || 'Térreo',
          }
        : undefined,
    storefrontOrder: extractedStorefrontOrder,
    stops,
    grossTotal:
      row.total_price !== null && row.total_price !== undefined
        ? Number(row.total_price)
        : computedPricing.grossTotal,
    standardPlatformFee: computedPricing.standardPlatformFee,
    basePayout: computedPricing.basePayout,
    status: orderStatus,
    paymentMethod: resolvedPaymentMethod,
    paymentStatus: resolvedPaymentStatus,
    assignedCourierId: row.driver_id || undefined,
    assignedCourierName: row.driver_name || undefined,
    assignedCourierAvatarUrl: assignedDriver?.avatarUrl,
    assignedCourierVehicleType: assignedDriver?.vehicleType,
    assignedCourierVehicleModel: assignedDriver?.vehicleModel,
    assignedCourierVehicleColor: assignedDriver?.vehicleColor,
    assignedCourierPlate: assignedDriver?.plate,
    assignedCourierPixKey: assignedDriver?.pixKey || undefined,
    assignedCourierPropulsion: assignedDriver?.propulsion,
    assignedCourierRatingAvg: assignedDriver?.ratingAvg,
    assignedCourierRatingCount: assignedDriver?.ratingCount,
    appliedPlatformFee: orderStatus !== 'Aguardando' ? appliedFee : undefined,
    evBonusApplied,
    netCourierPayout: orderStatus !== 'Aguardando' ? driverPayout : undefined,
    courierQuickNotice:
      orderStatus === 'Em Rota' ? extractedQuickNotice : undefined,
    courierNoticeHistory:
      historyEvents.length > 0 ? historyEvents : undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

async function fetchStopsForDeliveries(
  deliveryIds: string[]
): Promise<Map<string, DbDeliveryStopRow[]>> {
  const stopsByDelivery = new Map<string, DbDeliveryStopRow[]>();
  if (deliveryIds.length === 0) return stopsByDelivery;

  const { data, error } = await supabase
    .from('delivery_stops')
    .select('*')
    .in('delivery_id', deliveryIds)
    .order('stop_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data || []) as DbDeliveryStopRow[]) {
    const list = stopsByDelivery.get(row.delivery_id) || [];
    list.push(row);
    stopsByDelivery.set(row.delivery_id, list);
  }

  return stopsByDelivery;
}

const BASE_SAFE_PROFILE_COLUMNS =
  'id, name, phone, email, pix_key, person_type, document_number, company_legal_name, role, vehicle_type, propulsion, max_radius_km, cnh_ear, status, two_factor_enabled, rating_avg, rating_count, is_online, created_at';

const COURIER_IDENTITY_COLUMNS =
  'avatar_url, vehicle_model, vehicle_color, vehicle_plate';

let supportsAcceptsMarketingColumn: boolean | null = null;
let supportsCourierIdentityColumns: boolean | null = null;

function isMissingAcceptsMarketingError(
  err: { code?: string; message?: string } | null
): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('accepts_marketing');
}

function isMissingCourierIdentityColumnError(
  err: { code?: string; message?: string } | null
): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('avatar_url') ||
    msg.includes('vehicle_model') ||
    msg.includes('vehicle_color') ||
    msg.includes('vehicle_plate')
  );
}

function buildProfileColumns(
  includeMarketing: boolean,
  includeIdentity: boolean
): string {
  const parts = [BASE_SAFE_PROFILE_COLUMNS];
  if (includeMarketing) parts.push('accepts_marketing');
  if (includeIdentity) parts.push(COURIER_IDENTITY_COLUMNS);
  return parts.join(', ');
}

async function runProfileQuery<T>(
  runner: (
    cols: string,
    includeMarketing: boolean,
    includeIdentity: boolean
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>
): Promise<{
  data: T | null;
  error: { code?: string; message: string } | null;
}> {
  let includeMarketing = supportsAcceptsMarketingColumn !== false;
  let includeIdentity = supportsCourierIdentityColumns !== false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cols = buildProfileColumns(includeMarketing, includeIdentity);
    const res = await runner(cols, includeMarketing, includeIdentity);
    if (!res.error) {
      if (includeMarketing) supportsAcceptsMarketingColumn = true;
      if (includeIdentity) supportsCourierIdentityColumns = true;
      return res as { data: T | null; error: null };
    }

    let retried = false;
    if (includeMarketing && isMissingAcceptsMarketingError(res.error)) {
      supportsAcceptsMarketingColumn = false;
      includeMarketing = false;
      retried = true;
    }
    if (includeIdentity && isMissingCourierIdentityColumnError(res.error)) {
      supportsCourierIdentityColumns = false;
      includeIdentity = false;
      retried = true;
    }

    if (!retried) {
      return res as {
        data: T | null;
        error: { code?: string; message: string } | null;
      };
    }
  }

  const finalCols = buildProfileColumns(false, false);
  const fallback = await runner(finalCols, false, false);
  return fallback as {
    data: T | null;
    error: { code?: string; message: string } | null;
  };
}

const PUBLIC_DIRECTORY_COLUMNS =
  'id, name, person_type, company_legal_name, role, vehicle_type, propulsion, max_radius_km, pix_key, status, rating_avg, rating_count, is_online, created_at';

function formatBrPhoneVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (digits) variants.add(digits);
  if (digits.length === 11) {
    variants.add(`(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`);
  } else if (digits.length === 10) {
    variants.add(`(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`);
  }
  return Array.from(variants);
}

export async function checkIfDatabaseIsEmpty(): Promise<boolean> {
  const [profRes, delRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('deliveries').select('id', { count: 'exact', head: true }),
  ]);

  if (profRes.error) {
    throw new Error(profRes.error.message);
  }
  if (delRes.error) {
    throw new Error(delRes.error.message);
  }

  return (profRes.count ?? 0) === 0 && (delRes.count ?? 0) === 0;
}

/**
 * Consulta agregada pública para a Landing Page: retorna apenas o total numérico
 * de entregadores/motoristas aprovados atualmente online, sem expor dados pessoais.
 */
export async function fetchOnlineCouriersCountInSupabase(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'aprovado')
    .in('role', ['entregador', 'motorista'])
    .eq('is_online', true);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function loginWithPhoneAndPin(
  identifier: string,
  pin: string
): Promise<Profile | null> {
  const trimmedId = identifier.trim();
  const trimmedPin = pin.trim();

  if (!trimmedId || !trimmedPin) {
    return null;
  }

  if (trimmedId.toLowerCase() === 'admin') {
    const { data: roleMatch, error: roleError } =
      await runProfileQuery<DbProfileRow[]>((cols) =>
        supabase
          .from('profiles')
          .select(cols)
          .eq('role', 'admin')
          .eq('access_pin', trimmedPin)
          .limit(1)
      );

    if (roleError) {
      throw new Error(roleError.message);
    }

    if (roleMatch && roleMatch.length > 0) {
      return normalizeProfileFromRow(roleMatch[0]);
    }

    const { data: phoneMatch, error: phoneError } =
      await runProfileQuery<DbProfileRow[]>((cols) =>
        supabase
          .from('profiles')
          .select(cols)
          .in('phone', ['admin', 'Admin'])
          .eq('access_pin', trimmedPin)
          .limit(1)
      );

    if (phoneError) {
      throw new Error(phoneError.message);
    }

    if (phoneMatch && phoneMatch.length > 0) {
      const row = phoneMatch[0];
      return normalizeProfileFromRow({ ...row, role: 'admin' });
    }

    return null;
  }

  const candidatePhones = formatBrPhoneVariants(trimmedId);
  if (candidatePhones.length === 0) return null;

  const { data, error } = await runProfileQuery<DbProfileRow[]>((cols) =>
    supabase
      .from('profiles')
      .select(cols)
      .in('phone', candidatePhones)
      .eq('access_pin', trimmedPin)
      .limit(1)
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return normalizeProfileFromRow(data[0]);
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await runProfileQuery<DbProfileRow[]>((cols) =>
    supabase
      .from('profiles')
      .select(cols)
      .order('created_at', { ascending: false })
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(normalizeProfileFromRow);
}

/**
 * Busca diretório público enxuto (sem CPF/CNPJ, e-mail, telefone ou PIN)
 * para exibir notas (estrelas) e identificar remetentes/condutores nas avaliações.
 */
export async function fetchPublicProfilesDirectory(): Promise<Profile[]> {
  if (supportsCourierIdentityColumns !== false) {
    const { data, error } = await supabase
      .from('profiles')
      .select(`${PUBLIC_DIRECTORY_COLUMNS}, ${COURIER_IDENTITY_COLUMNS}`)
      .order('created_at', { ascending: false });

    if (!error) {
      supportsCourierIdentityColumns = true;
      return ((data || []) as DbProfileRow[]).map(normalizeProfileFromRow);
    }

    if (!isMissingCourierIdentityColumnError(error)) {
      throw new Error(error.message);
    }
    supportsCourierIdentityColumns = false;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_DIRECTORY_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as DbProfileRow[]).map(normalizeProfileFromRow);
}

export async function fetchApprovedCouriers(): Promise<Profile[]> {
  const { data, error } = await runProfileQuery<DbProfileRow[]>((cols) =>
    supabase
      .from('profiles')
      .select(cols)
      .eq('status', 'aprovado')
      .in('role', ['entregador', 'motorista'])
      .order('created_at', { ascending: false })
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(normalizeProfileFromRow);
}

export async function fetchAllDeliveries(
  profilesList?: Profile[]
): Promise<Order[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const deliveryRows = (data || []) as DbDeliveryRow[];
  const stopsMap = await fetchStopsForDeliveries(deliveryRows.map((d) => d.id));
  const profileMap = new Map(
    (profilesList || []).map((p) => [p.id, p] as const)
  );

  return deliveryRows.map((d) =>
    normalizeOrderFromRows(d, stopsMap.get(d.id) || [], profileMap)
  );
}

export async function fetchWaitingDeliveries(
  profilesList?: Profile[]
): Promise<Order[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('status', 'aguardando')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const deliveryRows = (data || []) as DbDeliveryRow[];
  const stopsMap = await fetchStopsForDeliveries(deliveryRows.map((d) => d.id));
  const profileMap = new Map(
    (profilesList || []).map((p) => [p.id, p] as const)
  );

  return deliveryRows.map((d) =>
    normalizeOrderFromRows(d, stopsMap.get(d.id) || [], profileMap)
  );
}

async function assertEmailIsAvailable(
  email: string,
  excludeProfileId?: string
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  if (!isValidEmail(normalized)) {
    throw new Error(
      'Informe um endereço de e-mail válido (ex.: nome@dominio.com).'
    );
  }

  let query = supabase
    .from('profiles')
    .select('id')
    .ilike('email', normalized)
    .limit(1);

  if (excludeProfileId) {
    query = query.neq('id', excludeProfileId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    throw new Error(
      'Este e-mail já está em uso no RotaJusta. Utilize outro e-mail ou faça login.'
    );
  }
}

export async function insertProfileInSupabase(
  profile: Omit<Profile, 'id' | 'approvalStatus' | 'createdAt'> & {
    accessPin: string;
    approvalStatus?: ApprovalStatus;
  }
): Promise<Profile> {
  const isDriverOrCourier =
    profile.role === 'entregador' || profile.role === 'motorista';

  const defaultApproval: ApprovalStatus =
    profile.role === 'lojista' || profile.role === 'admin'
      ? 'Aprovado'
      : 'Aguardando Aprovação';

  const docDigits = onlyDigits(
    profile.documentNumber || profile.document || ''
  );
  const resolvedPersonType: PersonType =
    profile.personType || (docDigits.length === 14 ? 'PJ' : 'PF');

  const cleanEmail = normalizeEmail(profile.email || '');
  if (cleanEmail) {
    await assertEmailIsAvailable(cleanEmail);
  }

  const cleanVehicleModel = isDriverOrCourier
    ? profile.vehicleModel?.trim() || null
    : null;
  const cleanVehicleColor = isDriverOrCourier
    ? profile.vehicleColor?.trim() || null
    : null;
  const cleanVehiclePlate =
    isDriverOrCourier && profile.vehicleType !== 'Bike'
      ? normalizePlateForDisplay(profile.plate) || null
      : isDriverOrCourier && profile.plate?.trim()
      ? normalizePlateForDisplay(profile.plate) || null
      : null;
  const cleanAvatarUrl = isDriverOrCourier
    ? profile.avatarUrl?.trim() || null
    : null;

  const fallbackMetaEncoded =
    isDriverOrCourier && resolvedPersonType !== 'PJ'
      ? encodeCourierIdentityMeta({
          a: cleanAvatarUrl || undefined,
          m: cleanVehicleModel || undefined,
          c: cleanVehicleColor || undefined,
          p: cleanVehiclePlate || undefined,
        })
      : null;

  const basePayload: Record<string, unknown> = {
    name: profile.name,
    phone: profile.phone,
    email: cleanEmail || null,
    role: profile.role,
    person_type: resolvedPersonType,
    document_number: docDigits || null,
    company_legal_name:
      resolvedPersonType === 'PJ'
        ? profile.companyLegalName?.trim() || null
        : null,
    vehicle_type: isDriverOrCourier ? profile.vehicleType ?? null : null,
    propulsion: isDriverOrCourier ? profile.propulsion ?? null : null,
    max_radius_km:
      isDriverOrCourier && profile.vehicleType === 'Bike'
        ? profile.bikeMaxRadiusKm === undefined
          ? 3
          : profile.bikeMaxRadiusKm
        : null,
    cnh_ear: Boolean(profile.hasEar),
    status: mapApprovalToDbStatus(profile.approvalStatus || defaultApproval),
    access_pin: profile.accessPin,
    pix_key:
      isDriverOrCourier || profile.role === 'admin'
        ? profile.pixKey?.trim() || null
        : null,
  };

  const { data, error } = await runProfileQuery<DbProfileRow>(
    (cols, includeMarketing, includeIdentity) => {
      const insertPayload: Record<string, unknown> = {
        ...basePayload,
      };
      if (includeMarketing) {
        insertPayload.accepts_marketing = Boolean(profile.acceptsMarketing);
      }
      if (includeIdentity) {
        insertPayload.avatar_url = cleanAvatarUrl;
        insertPayload.vehicle_model = cleanVehicleModel;
        insertPayload.vehicle_color = cleanVehicleColor;
        insertPayload.vehicle_plate = cleanVehiclePlate;
      } else if (fallbackMetaEncoded) {
        insertPayload.company_legal_name = fallbackMetaEncoded;
      }
      return supabase
        .from('profiles')
        .insert(insertPayload)
        .select(cols)
        .single();
    }
  );

  if (error) {
    const errLower = (error.message || '').toLowerCase();
    if (
      error.code === '23505' ||
      errLower.includes('23505') ||
      errLower.includes('duplicate key')
    ) {
      if (errLower.includes('email')) {
        throw new Error(
          'Este e-mail já está em uso no RotaJusta. Utilize outro e-mail ou faça login.'
        );
      }
      if (errLower.includes('phone')) {
        throw new Error('Este telefone já está cadastrado no RotaJusta.');
      }
      throw new Error('Este CPF/CNPJ já está cadastrado no RotaJusta.');
    }
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function updatePixKeyInSupabase(
  profileId: string,
  pixKey: string
): Promise<Profile> {
  const cleanKey = pixKey.trim();
  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update({ pix_key: cleanKey || null })
      .eq('id', profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function fetchPlatformPixKey(): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('pix_key')
    .eq('role', 'admin')
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const row = (data?.[0] as { pix_key?: string | null } | undefined) || undefined;
  return row?.pix_key?.trim() || null;
}

export async function updateProfileStatusInSupabase(
  profileId: string,
  approvalStatus: ApprovalStatus
): Promise<Profile> {
  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update({ status: mapApprovalToDbStatus(approvalStatus) })
      .eq('id', profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export interface AdminProfileUpdateInput {
  profileId: string;
  name: string;
  phone: string;
  email?: string;
  acceptsMarketing?: boolean;
  role: UserRole;
  personType: PersonType;
  documentNumber?: string;
  companyLegalName?: string;
  approvalStatus: ApprovalStatus;
  accessPin?: string;
  pixKey?: string;
  avatarUrl?: string | null;
  vehicleType?: VehicleType | null;
  propulsion?: PropulsionType | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  plate?: string | null;
  bikeMaxRadiusKm?: number | null;
  hasEar?: boolean;
}

export async function adminUpdateProfileInSupabase(
  input: AdminProfileUpdateInput
): Promise<Profile> {
  const cleanName = input.name.trim();
  const cleanPhone = input.phone.trim();
  if (!cleanName || !cleanPhone) {
    throw new Error('Nome e telefone/usuário de acesso são obrigatórios.');
  }

  const cleanEmail = normalizeEmail(input.email || '');
  if (cleanEmail) {
    await assertEmailIsAvailable(cleanEmail, input.profileId);
  }

  const cleanPin = (input.accessPin || '').trim();
  if (cleanPin && !/^\d{4}$/.test(cleanPin)) {
    throw new Error('O PIN de acesso deve conter exatamente 4 dígitos numéricos.');
  }

  const isDriverOrCourier =
    input.role === 'entregador' || input.role === 'motorista';
  const docDigits = onlyDigits(input.documentNumber || '');

  const cleanVehicleModel = isDriverOrCourier
    ? input.vehicleModel?.trim() || null
    : null;
  const cleanVehicleColor = isDriverOrCourier
    ? input.vehicleColor?.trim() || null
    : null;
  const cleanVehiclePlate = isDriverOrCourier
    ? normalizePlateForDisplay(input.plate) || null
    : null;
  const cleanAvatarUrl = isDriverOrCourier
    ? input.avatarUrl?.trim() || null
    : null;

  const fallbackMetaEncoded =
    isDriverOrCourier && input.personType !== 'PJ'
      ? encodeCourierIdentityMeta({
          a: cleanAvatarUrl || undefined,
          m: cleanVehicleModel || undefined,
          c: cleanVehicleColor || undefined,
          p: cleanVehiclePlate || undefined,
        })
      : null;

  let preservedStorefront: MerchantStorefrontConfig | undefined;
  if (input.role === 'lojista' || input.role === 'admin') {
    const { data: existingRow } = await supabase
      .from('profiles')
      .select('company_legal_name')
      .eq('id', input.profileId)
      .maybeSingle();
    const existingLegalRaw = (
      existingRow as { company_legal_name?: string | null } | null
    )?.company_legal_name;
    preservedStorefront =
      decodeStorefrontMetaFromCompanyName(existingLegalRaw).storefront;
  }

  const baseCompanyLegalName =
    input.personType === 'PJ'
      ? input.companyLegalName?.trim() || cleanName
      : undefined;

  const basePayload: Record<string, unknown> = {
    name: cleanName,
    phone: cleanPhone,
    email: cleanEmail || null,
    role: input.role,
    person_type: input.personType,
    document_number: docDigits || null,
    company_legal_name: encodeStorefrontMetaInCompanyName(
      baseCompanyLegalName,
      preservedStorefront
    ),
    status: mapApprovalToDbStatus(input.approvalStatus),
    pix_key: input.pixKey?.trim() || null,
    vehicle_type: isDriverOrCourier ? input.vehicleType ?? null : null,
    propulsion: isDriverOrCourier ? input.propulsion ?? null : null,
    max_radius_km:
      isDriverOrCourier && input.vehicleType === 'Bike'
        ? input.bikeMaxRadiusKm === undefined
          ? 3
          : input.bikeMaxRadiusKm
        : null,
    cnh_ear: isDriverOrCourier ? Boolean(input.hasEar) : false,
  };

  if (cleanPin) {
    basePayload.access_pin = cleanPin;
  }

  const { data, error } = await runProfileQuery(
    (cols, includeMarketing, includeIdentity) => {
      const updatePayload: Record<string, unknown> = {
        ...basePayload,
      };
      if (includeMarketing && input.acceptsMarketing !== undefined) {
        updatePayload.accepts_marketing = Boolean(input.acceptsMarketing);
      }
      if (includeIdentity) {
        updatePayload.avatar_url = cleanAvatarUrl;
        updatePayload.vehicle_model = cleanVehicleModel;
        updatePayload.vehicle_color = cleanVehicleColor;
        updatePayload.vehicle_plate = cleanVehiclePlate;
      } else if (isDriverOrCourier && input.personType !== 'PJ') {
        updatePayload.company_legal_name = fallbackMetaEncoded;
      }
      return supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', input.profileId)
        .select(cols)
        .single();
    }
  );

  if (error) {
    const errLower = (error.message || '').toLowerCase();
    if (
      error.code === '23505' ||
      errLower.includes('23505') ||
      errLower.includes('duplicate key')
    ) {
      if (errLower.includes('email')) {
        throw new Error(
          'Este e-mail já está em uso por outro usuário no RotaJusta.'
        );
      }
      throw new Error(
        'Este CPF/CNPJ ou telefone já pertence a outro usuário cadastrado.'
      );
    }
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function updateCourierIdentityInSupabase(params: {
  profileId: string;
  avatarUrl?: string | null;
  vehicleType: VehicleType;
  propulsion: PropulsionType;
  vehicleModel: string;
  vehicleColor: string;
  plate?: string;
  bikeMaxRadiusKm?: number | null;
}): Promise<Profile> {
  const cleanModel = params.vehicleModel.trim();
  const cleanColor = params.vehicleColor.trim();
  const cleanPlate = normalizePlateForDisplay(params.plate) || null;
  const cleanAvatar = params.avatarUrl?.trim() || null;

  const fallbackMetaEncoded = encodeCourierIdentityMeta({
    a: cleanAvatar || undefined,
    m: cleanModel || undefined,
    c: cleanColor || undefined,
    p: cleanPlate || undefined,
  });

  const basePayload: Record<string, unknown> = {
    vehicle_type: params.vehicleType,
    propulsion: params.propulsion,
    max_radius_km:
      params.vehicleType === 'Bike'
        ? params.bikeMaxRadiusKm === undefined
          ? 3
          : params.bikeMaxRadiusKm
        : null,
  };

  const { data, error } = await runProfileQuery(
    (cols, _includeMarketing, includeIdentity) => {
      const updatePayload: Record<string, unknown> = { ...basePayload };
      if (includeIdentity) {
        updatePayload.avatar_url = cleanAvatar;
        updatePayload.vehicle_model = cleanModel || null;
        updatePayload.vehicle_color = cleanColor || null;
        updatePayload.vehicle_plate = cleanPlate;
      } else {
        updatePayload.company_legal_name = fallbackMetaEncoded;
      }
      return supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', params.profileId)
        .select(cols)
        .single();
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function adminDeleteProfileInSupabase(params: {
  profileId: string;
  currentAdminId: string;
}): Promise<void> {
  if (params.profileId === params.currentAdminId) {
    throw new Error(
      'Não é possível excluir o próprio usuário Administrador logado no momento.'
    );
  }

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', params.profileId);

  if (error) {
    const errLower = (error.message || '').toLowerCase();
    if (
      error.code === '23503' ||
      errLower.includes('foreign key') ||
      errLower.includes('violates')
    ) {
      throw new Error(
        'Este usuário possui entregas ou avaliações vinculadas no histórico. Utilize a opção "Bloquear" para suspender o acesso sem perder o histórico.'
      );
    }
    throw new Error(error.message);
  }
}

function normalizeRatingFromRow(row: DbRatingRow): Rating {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    fromProfileId: row.from_profile_id,
    toProfileId: row.to_profile_id,
    stars: Number(row.stars),
    comment: row.comment || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export async function fetchAllRatingsInSupabase(): Promise<Rating[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select('id, delivery_id, from_profile_id, to_profile_id, stars, comment, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as DbRatingRow[]).map(normalizeRatingFromRow);
}

export async function submitRatingInSupabase(params: {
  deliveryId: string;
  fromProfileId: string;
  toProfileId: string;
  stars: number;
  comment?: string;
}): Promise<{
  rating: Rating;
  targetProfileId: string;
  ratingAvg: number;
  ratingCount: number;
}> {
  const safeStars = Math.round(params.stars);
  if (safeStars < 1 || safeStars > 5) {
    throw new Error('A avaliação deve ter entre 1 e 5 estrelas.');
  }
  if (!params.fromProfileId || !params.toProfileId) {
    throw new Error('Perfis inválidos para registrar avaliação.');
  }
  if (params.fromProfileId === params.toProfileId) {
    throw new Error('Não é possível avaliar o próprio perfil.');
  }

  // Bloqueia avaliar o mesmo pedido duas vezes pelo mesmo usuário
  const { data: existing, error: existingErr } = await supabase
    .from('ratings')
    .select('id')
    .eq('delivery_id', params.deliveryId)
    .eq('from_profile_id', params.fromProfileId)
    .maybeSingle();

  if (existingErr) {
    throw new Error(existingErr.message);
  }
  if (existing) {
    throw new Error('Você já avaliou este pedido.');
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('ratings')
    .insert({
      delivery_id: params.deliveryId,
      from_profile_id: params.fromProfileId,
      to_profile_id: params.toProfileId,
      stars: safeStars,
      comment: params.comment?.trim() || null,
    })
    .select('id, delivery_id, from_profile_id, to_profile_id, stars, comment, created_at')
    .single();

  if (insertErr) {
    const errLower = (insertErr.message || '').toLowerCase();
    if (
      insertErr.code === '23505' ||
      errLower.includes('duplicate key')
    ) {
      throw new Error('Você já avaliou este pedido.');
    }
    throw new Error(insertErr.message);
  }

  // Recalcula rating_avg e rating_count do usuário avaliado
  const { data: allTargetRatings, error: statsErr } = await supabase
    .from('ratings')
    .select('stars')
    .eq('to_profile_id', params.toProfileId);

  if (statsErr) {
    throw new Error(statsErr.message);
  }

  const rows = (allTargetRatings || []) as Array<{ stars: number }>;
  const ratingCount = rows.length;
  const totalStars = rows.reduce((acc, r) => acc + Number(r.stars || 0), 0);
  const ratingAvg =
    ratingCount > 0 ? Number((totalStars / ratingCount).toFixed(2)) : 0;

  const { error: updateProfErr } = await supabase
    .from('profiles')
    .update({
      rating_avg: ratingAvg,
      rating_count: ratingCount,
    })
    .eq('id', params.toProfileId);

  if (updateProfErr) {
    throw new Error(updateProfErr.message);
  }

  return {
    rating: normalizeRatingFromRow(inserted as DbRatingRow),
    targetProfileId: params.toProfileId,
    ratingAvg,
    ratingCount,
  };
}

export async function updateBikeMaxRadiusInSupabase(
  courierId: string,
  radiusKm: number | null
): Promise<Profile> {
  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update({ max_radius_km: radiusKm })
      .eq('id', courierId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function updateCourierOnlineStatusInSupabase(
  profileId: string,
  isOnline: boolean
): Promise<Profile> {
  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update({ is_online: isOnline })
      .eq('id', profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function fetchDeliveryByIdWithStops(
  deliveryId: string,
  profilesList?: Profile[]
): Promise<Order | null> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('id', deliveryId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const stopsMap = await fetchStopsForDeliveries([deliveryId]);
  const profileMap = new Map(
    (profilesList || []).map((p) => [p.id, p] as const)
  );
  return normalizeOrderFromRows(
    data as DbDeliveryRow,
    stopsMap.get(deliveryId) || [],
    profileMap
  );
}

export async function fetchPublicOrderTrackingByCode(
  codeOrId: string
): Promise<Order | null> {
  const raw = String(codeOrId || '').trim();
  if (!raw) return null;

  const directory = await fetchPublicProfilesDirectory().catch(() => [] as Profile[]);
  const profileMap = new Map(directory.map((p) => [p.id, p] as const));

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(raw)) {
    return fetchDeliveryByIdWithStops(raw, directory);
  }

  const normalizedSuffix = raw
    .toUpperCase()
    .replace(/^#/, '')
    .replace(/^RS-?/, '')
    .replace(/[^A-Z0-9]/g, '');
  if (!normalizedSuffix) return null;

  const targetCode = `#RS-${normalizedSuffix.slice(0, 4).padEnd(4, '0')}`;

  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as DbDeliveryRow[];
  const matched =
    rows.find((r) => formatDeliveryCode(r.id) === targetCode) ||
    rows.find((r) =>
      r.id
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .startsWith(normalizedSuffix)
    );

  if (!matched) return null;

  const stopsMap = await fetchStopsForDeliveries([matched.id]);
  return normalizeOrderFromRows(
    matched,
    stopsMap.get(matched.id) || [],
    profileMap
  );
}

export async function verifyLoginTwoFactor(
  profileId: string,
  totpCode: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('two_factor_enabled, two_factor_secret')
    .eq('id', profileId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const row = data as {
    two_factor_enabled?: boolean | null;
    two_factor_secret?: string | null;
  };

  if (!row.two_factor_enabled) {
    return true;
  }

  if (!row.two_factor_secret) {
    throw new Error('Configuração de 2FA inválida neste perfil.');
  }

  return verifyTotpCode(row.two_factor_secret, totpCode);
}

async function verifyCurrentSecurityChallenge(
  profileId: string,
  currentPin: string,
  totpCode?: string
): Promise<void> {
  const trimmedPin = currentPin.trim();
  if (!/^\d{4}$/.test(trimmedPin)) {
    throw new Error('Informe seu PIN atual de 4 dígitos.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, two_factor_enabled, two_factor_secret')
    .eq('id', profileId)
    .eq('access_pin', trimmedPin)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('PIN atual incorreto.');
  }

  const row = data as {
    id: string;
    two_factor_enabled?: boolean | null;
    two_factor_secret?: string | null;
  };

  if (row.two_factor_enabled) {
    const cleanCode = (totpCode || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new Error(
        'Digite o código de 6 dígitos do aplicativo autenticador.'
      );
    }
    const valid = await verifyTotpCode(row.two_factor_secret || '', cleanCode);
    if (!valid) {
      throw new Error('Código de 6 dígitos do autenticador inválido ou expirado.');
    }
  }
}

export async function updateBasicAccountInfoInSupabase(params: {
  profileId: string;
  name: string;
  email: string;
  acceptsMarketing?: boolean;
}): Promise<Profile> {
  const cleanEmail = normalizeEmail(params.email || '');
  if (cleanEmail) {
    await assertEmailIsAvailable(cleanEmail, params.profileId);
  }

  const basePayload = {
    name: params.name.trim(),
    email: cleanEmail || null,
  };

  const { data, error } = await runProfileQuery((cols, includeMarketing) =>
    supabase
      .from('profiles')
      .update(
        includeMarketing && params.acceptsMarketing !== undefined
          ? { ...basePayload, accepts_marketing: Boolean(params.acceptsMarketing) }
          : basePayload
      )
      .eq('id', params.profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function updateLoginIdentifierInSupabase(params: {
  profileId: string;
  newPhone: string;
  currentPin: string;
  totpCode?: string;
}): Promise<Profile> {
  await verifyCurrentSecurityChallenge(
    params.profileId,
    params.currentPin,
    params.totpCode
  );

  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update({ phone: params.newPhone.trim() })
      .eq('id', params.profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function updateAccessPinInSupabase(params: {
  profileId: string;
  currentPin: string;
  newPin: string;
  totpCode?: string;
}): Promise<void> {
  const cleanNewPin = params.newPin.trim();
  if (!/^\d{4}$/.test(cleanNewPin)) {
    throw new Error('O novo PIN deve ter exatamente 4 dígitos numéricos.');
  }

  await verifyCurrentSecurityChallenge(
    params.profileId,
    params.currentPin,
    params.totpCode
  );

  const { error } = await supabase
    .from('profiles')
    .update({ access_pin: cleanNewPin })
    .eq('id', params.profileId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function enableTwoFactorInSupabase(params: {
  profileId: string;
  secret: string;
  totpCode: string;
}): Promise<Profile> {
  const isValid = await verifyTotpCode(params.secret, params.totpCode);
  if (!isValid) {
    throw new Error(
      'Código de 6 dígitos incorreto. Confira o horário do celular e tente o código atual do autenticador.'
    );
  }

  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update({
        two_factor_enabled: true,
        two_factor_secret: params.secret,
      })
      .eq('id', params.profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export async function disableTwoFactorInSupabase(params: {
  profileId: string;
  currentPin: string;
  totpCode: string;
}): Promise<Profile> {
  await verifyCurrentSecurityChallenge(
    params.profileId,
    params.currentPin,
    params.totpCode
  );

  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
      })
      .eq('id', params.profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

/**
 * Inserts into `deliveries` and `delivery_stops` sending ONLY the exact
 * schema columns for each table.
 */
export async function createDeliveryInSupabase(order: Order): Promise<Order> {
  const pickupWithNeighborhood = order.pickupAddress.includes(
    order.pickupNeighborhood
  )
    ? order.pickupAddress
    : `${order.pickupAddress} (${order.pickupNeighborhood})`;

  const chosenMethod: PixPaymentMethod = order.paymentMethod || 'pix_direto';
  const baseName = order.merchantName || 'Painel do Lojista';
  const hasValidMerchantId =
    Boolean(order.merchantId) && order.merchantId !== 'lojista-supabase';

  const sourceTags: string[] = [];
  if (hasValidMerchantId) {
    sourceTags.push(`[UID:${order.merchantId}]`);
  }
  if (order.flowDirection === 'receber') {
    sourceTags.push('[DIR:receber]');
  } else if (order.flowDirection === 'enviar') {
    sourceTags.push('[DIR:enviar]');
  }
  const vehicleTag = encodeVehicleTag(order.requestedVehicle);
  if (vehicleTag) {
    sourceTags.push(`[VEH:${vehicleTag}]`);
  }
  if (
    order.pickupSchedule &&
    (order.pickupSchedule.mode === 'agendada' ||
      order.pickupSchedule.deadlineAt)
  ) {
    const modeTag = order.pickupSchedule.mode;
    const ready = order.pickupSchedule.readyAt || '';
    const deadline = order.pickupSchedule.deadlineAt || '';
    sourceTags.push(`[AGD:${modeTag}|${ready}|${deadline}]`);
  }
  if (order.storefrontOrder) {
    sourceTags.push(encodeStorefrontOrderTag(order.storefrontOrder));
  }
  const sourceChannelWithTags =
    sourceTags.length > 0 ? `${baseName} ${sourceTags.join(' ')}` : baseName;

  const basePayload: Record<string, unknown> = {
    type: order.type,
    pickup_address: pickupWithNeighborhood,
    delivery_region: order.destinationNeighborhood,
    distance_km: order.distanceKm ?? null,
    package_count: order.packageCount,
    cargo_description:
      order.freightDetails?.cargoDescription ??
      (order.storefrontOrder
        ? formatStorefrontItemsSummaryText(order.storefrontOrder)
        : null),
    cargo_size: order.freightDetails?.cargoSize ?? null,
    has_helper: Boolean(order.freightDetails?.includeHelper),
    access_notes: order.freightDetails?.accessNote ?? null,
    driver_payout: order.basePayout,
    platform_fee: order.standardPlatformFee,
    total_price: order.grossTotal,
    status: 'aguardando' as DbDeliveryStatus,
    payment_status: 'pendente_pagamento' as PaymentStatus,
    driver_id: null,
    driver_name: null,
    source_channel: sourceChannelWithTags,
  };

  const extendedPayload: Record<string, unknown> = {
    ...basePayload,
    payment_method: chosenMethod,
    request_direction: order.flowDirection === 'receber' ? 'receive' : 'send',
    pickup_scheduled_at: order.pickupSchedule?.readyAt
      ? new Date(order.pickupSchedule.readyAt).toISOString()
      : null,
    pickup_deadline_at: order.pickupSchedule?.deadlineAt
      ? new Date(order.pickupSchedule.deadlineAt).toISOString()
      : null,
  };

  let { data: insertedDelivery, error: deliveryError } = await supabase
    .from('deliveries')
    .insert(extendedPayload)
    .select('*')
    .single();

  if (
    deliveryError &&
    (deliveryError.code === 'PGRST204' ||
      deliveryError.code === '42703' ||
      deliveryError.message.includes('payment_method') ||
      deliveryError.message.includes('request_direction') ||
      deliveryError.message.includes('pickup_scheduled_at') ||
      deliveryError.message.includes('pickup_deadline_at'))
  ) {
    const fallbackSource =
      chosenMethod === 'pix_plataforma'
        ? `${sourceChannelWithTags} [PIX:plataforma]`
        : sourceChannelWithTags;
    const retryWithPaymentMethod = await supabase
      .from('deliveries')
      .insert({
        ...basePayload,
        payment_method: chosenMethod,
      })
      .select('*')
      .single();

    if (!retryWithPaymentMethod.error) {
      insertedDelivery = retryWithPaymentMethod.data;
      deliveryError = null;
    } else {
      const retryBase = await supabase
        .from('deliveries')
        .insert({
          ...basePayload,
          source_channel: fallbackSource,
        })
        .select('*')
        .single();
      insertedDelivery = retryBase.data;
      deliveryError = retryBase.error;
    }
  }

  if (deliveryError) {
    throw new Error(deliveryError.message);
  }

  const stopPayloads = order.stops.map((stop) => ({
    delivery_id: (insertedDelivery as DbDeliveryRow).id,
    stop_order: stop.sequence,
    address: stop.address,
    neighborhood: stop.neighborhood,
    recipient_name: stop.expectedRecipient || null,
    notes: stop.recipientNote || null,
    status: 'pendente' as DbStopStatus,
    delivered_at: null,
    proof_recipient: null,
    proof_photo_base64: null,
  }));

  const { data: insertedStops, error: stopsError } = await supabase
    .from('delivery_stops')
    .insert(stopPayloads)
    .select('*');

  if (stopsError) {
    throw new Error(stopsError.message);
  }

  return normalizeOrderFromRows(
    insertedDelivery as DbDeliveryRow,
    (insertedStops || []) as DbDeliveryStopRow[],
    new Map()
  );
}

export async function updateDeliveryPaymentStatusInSupabase(
  orderId: string,
  paymentStatus: PaymentStatus,
  profilesList?: Profile[]
): Promise<Order> {
  const { data: updatedDelivery, error } = await supabase
    .from('deliveries')
    .update({ payment_status: paymentStatus })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const stopsMap = await fetchStopsForDeliveries([
    (updatedDelivery as DbDeliveryRow).id,
  ]);
  const profileMap = new Map(
    (profilesList || []).map((p) => [p.id, p] as const)
  );
  return normalizeOrderFromRows(
    updatedDelivery as DbDeliveryRow,
    stopsMap.get((updatedDelivery as DbDeliveryRow).id) || [],
    profileMap
  );
}

export async function acceptDeliveryInSupabase(
  order: Order,
  courier: Profile,
  settlement: {
    platformFee: number;
    evBonus: number;
    netPayout: number;
    propulsion: PropulsionType;
  }
): Promise<Order> {
  const { data: updatedRow, error } = await supabase
    .from('deliveries')
    .update({
      status: 'em_rota' as DbDeliveryStatus,
      driver_id: courier.id,
      driver_name: courier.name,
      platform_fee: settlement.platformFee,
      driver_payout: settlement.netPayout,
    })
    .eq('id', order.id)
    .eq('status', 'aguardando')
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const stopsMap = await fetchStopsForDeliveries([(updatedRow as DbDeliveryRow).id]);
  const profileMap = new Map([[courier.id, courier]]);
  return normalizeOrderFromRows(
    updatedRow as DbDeliveryRow,
    stopsMap.get((updatedRow as DbDeliveryRow).id) || [],
    profileMap
  );
}

export async function fetchProfilesPhonesByIds(
  profileIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  const phoneMap = new Map<string, string>();
  if (uniqueIds.length === 0) return phoneMap;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone')
    .in('id', uniqueIds);

  if (error || !data) {
    return phoneMap;
  }

  for (const row of data as Array<{ id: string; phone?: string | null }>) {
    if (row.id && row.phone) {
      phoneMap.set(row.id, row.phone);
    }
  }
  return phoneMap;
}

export async function updateDeliveryQuickNoticeInSupabase(params: {
  orderId: string;
  noticeType: CourierQuickNoticeType;
  stopSequence?: number;
  profilesList?: Profile[];
}): Promise<Order> {
  const { orderId, noticeType, stopSequence, profilesList } = params;
  const nowIso = new Date().toISOString();

  const { data: currentRow } = await supabase
    .from('deliveries')
    .select('source_channel')
    .eq('id', orderId)
    .maybeSingle();

  const rawExistingSource = String(
    (currentRow as { source_channel?: string | null } | null)
      ?.source_channel || 'Lojista Porto Alegre'
  );

  const existingEvents = rawExistingSource.match(/\[EVT:[^\]]*\]/g) || [];
  const nextEvtTag = stopSequence
    ? `[EVT:${noticeType}|${nowIso}|${stopSequence}]`
    : `[EVT:${noticeType}|${nowIso}]`;
  const trimmedHistory = [...existingEvents, nextEvtTag].slice(-8).join(' ');

  const baseSource = rawExistingSource
    .replace(/\s*\[AVISO:[^\]]*\]/g, '')
    .replace(/\s*\[EVT:[^\]]*\]/g, '')
    .trim();

  const noticeTag = stopSequence
    ? `[AVISO:${noticeType}|${nowIso}|${stopSequence}]`
    : `[AVISO:${noticeType}|${nowIso}]`;

  const nextSourceChannel = `${baseSource} ${noticeTag} ${trimmedHistory}`
    .replace(/\s+/g, ' ')
    .trim();

  let { data: updatedRow, error } = await supabase
    .from('deliveries')
    .update({
      courier_notice: noticeType,
      courier_notice_at: nowIso,
      source_channel: nextSourceChannel,
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (
    error &&
    (error.code === 'PGRST204' ||
      error.code === '42703' ||
      error.message.includes('courier_notice'))
  ) {
    const retryRes = await supabase
      .from('deliveries')
      .update({
        source_channel: nextSourceChannel,
      })
      .eq('id', orderId)
      .select('*')
      .single();

    updatedRow = retryRes.data;
    error = retryRes.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  const rowObj = updatedRow as DbDeliveryRow;
  const stopsMap = await fetchStopsForDeliveries([rowObj.id]);
  const profileMap = new Map(
    (profilesList || []).map((p) => [p.id, p] as const)
  );
  const normalized = normalizeOrderFromRows(
    rowObj,
    stopsMap.get(rowObj.id) || [],
    profileMap
  );

  const fallbackNotice = buildCourierQuickNotice(
    noticeType,
    nowIso,
    stopSequence
  );
  return {
    ...normalized,
    courierQuickNotice: normalized.courierQuickNotice || fallbackNotice,
    courierNoticeHistory:
      normalized.courierNoticeHistory &&
      normalized.courierNoticeHistory.length > 0
        ? normalized.courierNoticeHistory
        : [fallbackNotice],
  };
}

export async function confirmDeliveryStopInSupabase(params: {
  order: Order;
  stopId: string;
  receiverName: string;
  proofPhotoDataUrl?: string;
  courier?: Profile;
}): Promise<{ updatedOrder: Order; autoCompleted: boolean }> {
  const { order, stopId, receiverName, proofPhotoDataUrl, courier } = params;
  const deliveredAt = new Date().toISOString();

  const { data: updatedStop, error: stopError } = await supabase
    .from('delivery_stops')
    .update({
      status: 'entregue' as DbStopStatus,
      proof_recipient: receiverName,
      proof_photo_base64: proofPhotoDataUrl || null,
      delivered_at: deliveredAt,
    })
    .eq('id', stopId)
    .select('*')
    .single();

  if (stopError) {
    throw new Error(stopError.message);
  }

  const updatedStops = order.stops.map((s) =>
    s.id === stopId
      ? normalizeStopFromRow(
          updatedStop as DbDeliveryStopRow,
          order.destinationNeighborhood
        )
      : s
  );

  return {
    updatedOrder: {
      ...order,
      stops: updatedStops,
    },
    autoCompleted: false,
  };
}

export async function completeDeliveryInSupabase(
  orderId: string,
  courier?: Profile,
  profilesList?: Profile[]
): Promise<Order> {
  const { data: updatedDelivery, error } = await supabase
    .from('deliveries')
    .update({
      status: 'entregue' as DbDeliveryStatus,
      payment_status: 'repassado' as PaymentStatus,
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const stopsMap = await fetchStopsForDeliveries([
    (updatedDelivery as DbDeliveryRow).id,
  ]);
  const profileMap = new Map<string, Profile>();
  for (const p of profilesList || []) {
    profileMap.set(p.id, p);
  }
  if (courier) {
    profileMap.set(courier.id, courier);
  }
  return normalizeOrderFromRows(
    updatedDelivery as DbDeliveryRow,
    stopsMap.get((updatedDelivery as DbDeliveryRow).id) || [],
    profileMap
  );
}

/**
 * Populates initial approved test profiles (Admin + 1 Moto Elétrica + 1 Utilitário)
 * and 2 orders in Porto Alegre when the Supabase database is empty.
 */
export async function seedInitialSupabaseData(): Promise<{
  profiles: Profile[];
  orders: Order[];
}> {
  const adminProfile = await insertProfileInSupabase({
    role: 'admin',
    name: 'Administrador RotaJusta',
    document: '',
    phone: 'admin',
    pixKey: 'pix@rotajusta.com.br',
    neighborhood: 'Centro Histórico',
    accessPin: '1234',
    approvalStatus: 'Aprovado',
  });

  const motoEvProfile = await insertProfileInSupabase({
    role: 'entregador',
    name: 'Lucas Ferreira',
    document: '',
    phone: '(51) 99455-8821',
    pixKey: '(51) 99455-8821',
    neighborhood: 'Bom Fim',
    vehicleType: 'Moto',
    propulsion: 'Elétrico',
    hasEar: true,
    accessPin: '1234',
    approvalStatus: 'Aprovado',
  });

  const utilityProfile = await insertProfileInSupabase({
    role: 'entregador',
    name: 'Diego Martins',
    document: '',
    phone: '(51) 99512-6630',
    pixKey: '(51) 99512-6630',
    neighborhood: 'Azenha',
    vehicleType: 'Utilitário / Picape / Van',
    propulsion: 'Combustão',
    hasEar: true,
    accessPin: '1234',
    approvalStatus: 'Aprovado',
  });

  const now = new Date().toISOString();

  const demo1Pricing = calculatePricing('rapida', 4.5, 1);
  const pickup1Coords = resolvePortoAlegreCoordinates(
    'Rua dos Andradas, 1234',
    'Centro Histórico',
    0
  );
  const stop1Coords = resolvePortoAlegreCoordinates(
    'Av. Getúlio Vargas, 890',
    'Menino Deus',
    1
  );

  const order1 = await createDeliveryInSupabase({
    id: '',
    code: '#RS-1041',
    type: 'rapida',
    merchantId: '',
    merchantName: 'Café & Livraria do Centro',
    pickupAddress: 'Rua dos Andradas, 1234',
    pickupNeighborhood: 'Centro Histórico',
    pickupLat: pickup1Coords.lat,
    pickupLng: pickup1Coords.lng,
    destinationNeighborhood: 'Menino Deus',
    distanceKm: 4.5,
    packageCount: 1,
    stops: [
      {
        id: '',
        sequence: 1,
        address: 'Av. Getúlio Vargas, 890',
        neighborhood: 'Menino Deus',
        expectedRecipient: 'Marcos Teixeira',
        recipientNote: 'Apto 402 · Livros + Café Especial (frágil)',
        lat: stop1Coords.lat,
        lng: stop1Coords.lng,
        delivered: false,
      },
    ],
    grossTotal: demo1Pricing.grossTotal,
    standardPlatformFee: demo1Pricing.standardPlatformFee,
    basePayout: demo1Pricing.basePayout,
    status: 'Aguardando',
    createdAt: now,
  });

  const demo2Pricing = calculatePricing('frete', 6, 1, {
    cargoSize: 'grande',
    includeHelper: true,
  });
  const pickup2Coords = resolvePortoAlegreCoordinates(
    'Rua Padre Chagas, 210',
    'Moinhos de Vento',
    0
  );
  const stop2Coords = resolvePortoAlegreCoordinates(
    'Rua João Alfredo, 418',
    'Cidade Baixa',
    1
  );

  const order2 = await createDeliveryInSupabase({
    id: '',
    code: '#RS-1042',
    type: 'frete',
    merchantId: '',
    merchantName: 'Empório Moinhos',
    pickupAddress: 'Rua Padre Chagas, 210',
    pickupNeighborhood: 'Moinhos de Vento',
    pickupLat: pickup2Coords.lat,
    pickupLng: pickup2Coords.lng,
    destinationNeighborhood: 'Cidade Baixa',
    distanceKm: 6,
    packageCount: 1,
    freightDetails: {
      cargoDescription: 'Geladeira duplex, sofá 2 lugares e 4 caixas',
      cargoSize: 'grande',
      includeHelper: true,
      accessNote: 'Elevador de serviço',
    },
    stops: [
      {
        id: '',
        sequence: 1,
        address: 'Rua João Alfredo, 418',
        neighborhood: 'Cidade Baixa',
        expectedRecipient: 'Carla Menezes',
        recipientNote:
          'Geladeira duplex, sofá 2 lugares e 4 caixas · Elevador de serviço',
        lat: stop2Coords.lat,
        lng: stop2Coords.lng,
        delivered: false,
      },
    ],
    grossTotal: demo2Pricing.grossTotal,
    standardPlatformFee: demo2Pricing.standardPlatformFee,
    basePayout: demo2Pricing.basePayout,
    status: 'Aguardando',
    createdAt: now,
  });

  return {
    profiles: [adminProfile, motoEvProfile, utilityProfile],
    orders: [order2, order1],
  };
}

export async function saveMerchantStorefrontInSupabase(params: {
  profileId: string;
  storefront: MerchantStorefrontConfig;
  storePixKey?: string;
}): Promise<Profile> {
  const { data: existingRow, error: fetchError } = await supabase
    .from('profiles')
    .select('company_legal_name')
    .eq('id', params.profileId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const existingRaw = (
    existingRow as { company_legal_name?: string | null } | null
  )?.company_legal_name;
  const { cleanLegalName } = decodeStorefrontMetaFromCompanyName(existingRaw);

  const encodedCompanyLegal = encodeStorefrontMetaInCompanyName(
    cleanLegalName,
    params.storefront
  );

  const updateFields: Record<string, unknown> = {
    company_legal_name: encodedCompanyLegal,
  };
  if (params.storePixKey !== undefined) {
    updateFields.pix_key = params.storePixKey.trim() || null;
  }

  const { data, error } = await runProfileQuery((cols) =>
    supabase
      .from('profiles')
      .update(updateFields)
      .eq('id', params.profileId)
      .select(cols)
      .single()
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as unknown as DbProfileRow);
}

export interface PublicStorefrontData {
  merchant: Profile;
  storefront: MerchantStorefrontConfig;
  platformPixKey: string | null;
}

export async function fetchPublicMerchantStorefrontInSupabase(
  merchantId: string
): Promise<PublicStorefrontData | null> {
  const cleanId = merchantId.trim();
  if (!cleanId) return null;

  const { data: row, error } = await supabase
    .from('profiles')
    .select(
      'id, name, phone, person_type, company_legal_name, role, pix_key, rating_avg, rating_count, status, created_at'
    )
    .eq('id', cleanId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!row) return null;

  const merchant = normalizeProfileFromRow(row as unknown as DbProfileRow);
  const platformPixKey = await fetchPlatformPixKey().catch(() => null);

  const baseStorefront: MerchantStorefrontConfig = merchant.storefront || {
    products: [],
  };

  if (!baseStorefront.storeAddress) {
    const { data: recentDeliveries } = await supabase
      .from('deliveries')
      .select('pickup_address, source_channel')
      .ilike('source_channel', `%[UID:${cleanId}]%`)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestPickup = (
      recentDeliveries?.[0] as { pickup_address?: string | null } | undefined
    )?.pickup_address;
    if (latestPickup) {
      const parsed = extractNeighborhoodFromAddress(latestPickup);
      const coords = resolvePortoAlegreCoordinates(
        parsed.address,
        parsed.neighborhood,
        0
      );
      baseStorefront.storeAddress = parsed.address;
      baseStorefront.storeNeighborhood = parsed.neighborhood;
      baseStorefront.storeLat = coords.lat;
      baseStorefront.storeLng = coords.lng;
    }
  }

  return {
    merchant,
    storefront: baseStorefront,
    platformPixKey,
  };
}
