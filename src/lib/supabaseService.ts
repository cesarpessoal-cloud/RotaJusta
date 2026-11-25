import { resolvePortoAlegreCoordinates } from '../constants/portoAlegre';
import {
  ApprovalStatus,
  CargoSize,
  DeliveryStop,
  Order,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PersonType,
  PixPaymentMethod,
  Profile,
  PropulsionType,
  UserRole,
  VehicleType,
} from '../types';
import { formatCpfOrCnpj, onlyDigits } from '../utils/documentValidation';
import { calculatePricing } from '../utils/pricing';
import { verifyTotpCode } from '../utils/totp';
import { supabase } from './supabase';

export type DbApprovalStatus = 'pendente' | 'aprovado' | 'bloqueado';
export type DbDeliveryStatus = 'aguardando' | 'em_rota' | 'entregue';
export type DbStopStatus = 'pendente' | 'entregue';

interface DbProfileRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  pix_key?: string | null;
  person_type?: string | null;
  document_number?: string | null;
  company_legal_name?: string | null;
  role: UserRole;
  vehicle_type: string | null;
  propulsion: string | null;
  max_radius_km: number | null;
  cnh_ear: boolean | null;
  status: string;
  two_factor_enabled?: boolean | null;
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
  if (normalized === 'entregue') return 'Entregue';
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
  const clean = String(id).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `RJ-${clean.slice(0, 4) || 'POA'}`;
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

  return {
    id: row.id,
    role: row.role || 'entregador',
    personType: resolvedPersonType,
    name: row.name,
    companyLegalName: row.company_legal_name || undefined,
    businessName:
      resolvedPersonType === 'PJ'
        ? row.company_legal_name || row.name
        : undefined,
    document: formattedDoc,
    documentNumber: docDigits || undefined,
    phone: row.phone || '',
    email: row.email || undefined,
    pixKey: row.pix_key || undefined,
    neighborhood: 'Porto Alegre',
    twoFactorEnabled: Boolean(row.two_factor_enabled),
    vehicleType,
    propulsion,
    hasEar: Boolean(row.cnh_ear),
    dailyPassInterest: row.role === 'motorista',
    bikeMaxRadiusKm,
    approvalStatus: mapDbStatusToApproval(row.status),
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

  const computedPricing = calculatePricing(
    row.type,
    row.distance_km ?? 1,
    packageCount,
    {
      cargoSize,
      includeHelper,
    }
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

  const rawSource = row.source_channel || 'Lojista Porto Alegre';
  const hasPlatformTag = rawSource.includes('[PIX:plataforma]');
  const cleanMerchantName =
    rawSource.replace(/\s*\[PIX:(?:plataforma|direto)\]/g, '').trim() ||
    'Lojista Porto Alegre';

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
    merchantId: 'lojista-supabase',
    merchantName: cleanMerchantName,
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
    assignedCourierPixKey: assignedDriver?.pixKey || undefined,
    assignedCourierPropulsion: assignedDriver?.propulsion,
    appliedPlatformFee: orderStatus !== 'Aguardando' ? appliedFee : undefined,
    evBonusApplied,
    netCourierPayout: orderStatus !== 'Aguardando' ? driverPayout : undefined,
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

const SAFE_PROFILE_COLUMNS =
  'id, name, phone, email, pix_key, person_type, document_number, company_legal_name, role, vehicle_type, propulsion, max_radius_km, cnh_ear, status, two_factor_enabled, created_at';

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
    const { data: roleMatch, error: roleError } = await supabase
      .from('profiles')
      .select(SAFE_PROFILE_COLUMNS)
      .eq('role', 'admin')
      .eq('access_pin', trimmedPin)
      .limit(1);

    if (roleError) {
      throw new Error(roleError.message);
    }

    if (roleMatch && roleMatch.length > 0) {
      return normalizeProfileFromRow(roleMatch[0] as DbProfileRow);
    }

    const { data: phoneMatch, error: phoneError } = await supabase
      .from('profiles')
      .select(SAFE_PROFILE_COLUMNS)
      .in('phone', ['admin', 'Admin'])
      .eq('access_pin', trimmedPin)
      .limit(1);

    if (phoneError) {
      throw new Error(phoneError.message);
    }

    if (phoneMatch && phoneMatch.length > 0) {
      const row = phoneMatch[0] as DbProfileRow;
      return normalizeProfileFromRow({ ...row, role: 'admin' });
    }

    return null;
  }

  const candidatePhones = formatBrPhoneVariants(trimmedId);
  if (candidatePhones.length === 0) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .in('phone', candidatePhones)
    .eq('access_pin', trimmedPin)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return normalizeProfileFromRow(data[0] as DbProfileRow);
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as DbProfileRow[]).map(normalizeProfileFromRow);
}

export async function fetchApprovedCouriers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .eq('status', 'aprovado')
    .in('role', ['entregador', 'motorista'])
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as DbProfileRow[]).map(normalizeProfileFromRow);
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

/**
 * Inserts into `profiles` sending ONLY the exact allowed columns:
 * name, phone, role, vehicle_type, propulsion, max_radius_km, cnh_ear, status, access_pin
 */
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

  const payload = {
    name: profile.name,
    phone: profile.phone,
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

  const { data, error } = await supabase
    .from('profiles')
    .insert(payload)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    const errLower = (error.message || '').toLowerCase();
    if (
      error.code === '23505' ||
      errLower.includes('23505') ||
      errLower.includes('duplicate key')
    ) {
      throw new Error('Este CPF/CNPJ já está cadastrado no RotaJusta.');
    }
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
}

export async function updatePixKeyInSupabase(
  profileId: string,
  pixKey: string
): Promise<Profile> {
  const cleanKey = pixKey.trim();
  const { data, error } = await supabase
    .from('profiles')
    .update({ pix_key: cleanKey || null })
    .eq('id', profileId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
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
  const { data, error } = await supabase
    .from('profiles')
    .update({ status: mapApprovalToDbStatus(approvalStatus) })
    .eq('id', profileId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
}

export async function updateBikeMaxRadiusInSupabase(
  courierId: string,
  radiusKm: number | null
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ max_radius_km: radiusKm })
    .eq('id', courierId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
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
}): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      name: params.name.trim(),
      email: params.email.trim() || null,
    })
    .eq('id', params.profileId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
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

  const { data, error } = await supabase
    .from('profiles')
    .update({ phone: params.newPhone.trim() })
    .eq('id', params.profileId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
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

  const { data, error } = await supabase
    .from('profiles')
    .update({
      two_factor_enabled: true,
      two_factor_secret: params.secret,
    })
    .eq('id', params.profileId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
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

  const { data, error } = await supabase
    .from('profiles')
    .update({
      two_factor_enabled: false,
      two_factor_secret: null,
    })
    .eq('id', params.profileId)
    .select(SAFE_PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileFromRow(data as DbProfileRow);
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

  const basePayload = {
    type: order.type,
    pickup_address: pickupWithNeighborhood,
    delivery_region: order.destinationNeighborhood,
    distance_km: order.distanceKm ?? null,
    package_count: order.packageCount,
    cargo_description: order.freightDetails?.cargoDescription ?? null,
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
    source_channel: order.merchantName || 'Painel do Lojista',
  };

  let { data: insertedDelivery, error: deliveryError } = await supabase
    .from('deliveries')
    .insert({
      ...basePayload,
      payment_method: chosenMethod,
    })
    .select('*')
    .single();

  if (
    deliveryError &&
    (deliveryError.message.includes('payment_method') ||
      deliveryError.code === 'PGRST204')
  ) {
    const fallbackSource =
      chosenMethod === 'pix_plataforma'
        ? `${basePayload.source_channel} [PIX:plataforma]`
        : basePayload.source_channel;
    const retry = await supabase
      .from('deliveries')
      .insert({
        ...basePayload,
        source_channel: fallbackSource,
      })
      .select('*')
      .single();
    insertedDelivery = retry.data;
    deliveryError = retry.error;
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

  const allDelivered =
    updatedStops.length > 0 && updatedStops.every((s) => s.delivered);

  if (allDelivered) {
    const { data: updatedDelivery, error: deliveryError } = await supabase
      .from('deliveries')
      .update({ status: 'entregue' as DbDeliveryStatus })
      .eq('id', order.id)
      .select('*')
      .single();

    if (deliveryError) {
      throw new Error(deliveryError.message);
    }

    const stopsMap = await fetchStopsForDeliveries([
      (updatedDelivery as DbDeliveryRow).id,
    ]);
    const profileMap = courier ? new Map([[courier.id, courier]]) : new Map();
    return {
      updatedOrder: normalizeOrderFromRows(
        updatedDelivery as DbDeliveryRow,
        stopsMap.get((updatedDelivery as DbDeliveryRow).id) || [],
        profileMap
      ),
      autoCompleted: true,
    };
  }

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
  courier?: Profile
): Promise<Order> {
  const { data: updatedDelivery, error } = await supabase
    .from('deliveries')
    .update({ status: 'entregue' as DbDeliveryStatus })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const stopsMap = await fetchStopsForDeliveries([
    (updatedDelivery as DbDeliveryRow).id,
  ]);
  const profileMap = courier ? new Map([[courier.id, courier]]) : new Map();
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
    code: 'RJ-1041',
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
    code: 'RJ-1042',
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
