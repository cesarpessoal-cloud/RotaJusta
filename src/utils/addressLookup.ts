export interface CepLookupResult {
  ok: boolean;
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  uf: string;
  lat?: number;
  lng?: number;
  source?: 'viacep' | 'brasilapi';
  errorMessage?: string;
}

export interface PhotonSuggestion {
  id: string;
  label: string;
  street: string;
  housenumber: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
  lat: number;
  lng: number;
}

export interface StructuredAddressValue {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  cityUf: string;
  lat?: number;
  lng?: number;
}

const BRAZIL_STATE_TO_UF: Record<string, string> = {
  'acre': 'AC',
  'alagoas': 'AL',
  'amapa': 'AP',
  'amapá': 'AP',
  'amazonas': 'AM',
  'bahia': 'BA',
  'ceara': 'CE',
  'ceará': 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  'espírito santo': 'ES',
  'goias': 'GO',
  'goiás': 'GO',
  'maranhao': 'MA',
  'maranhão': 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  'para': 'PA',
  'pará': 'PA',
  'paraiba': 'PB',
  'paraíba': 'PB',
  'parana': 'PR',
  'paraná': 'PR',
  'pernambuco': 'PE',
  'piaui': 'PI',
  'piauí': 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  'rondonia': 'RO',
  'rondônia': 'RO',
  'roraima': 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  'são paulo': 'SP',
  'sergipe': 'SE',
  'tocantins': 'TO',
};

export function onlyCepDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

export function formatCepMask(value: string): string {
  const digits = onlyCepDigits(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function mapStateNameToUf(state?: string): string {
  if (!state) return 'RS';
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return BRAZIL_STATE_TO_UF[trimmed.toLowerCase()] || 'RS';
}

export function formatCityUf(city?: string, uf?: string): string {
  const cleanCity = (city || '').trim();
  const cleanUf = (uf || '').trim().toUpperCase();
  if (cleanCity && cleanUf) return `${cleanCity} / ${cleanUf}`;
  if (cleanCity) return cleanCity;
  return 'Porto Alegre / RS';
}

export function formatFullAddressLine(addr: {
  street: string;
  number: string;
  complement?: string;
}): string {
  const street = addr.street.trim();
  const num = addr.number.trim();
  const comp = (addr.complement || '').trim();
  if (!street) return '';
  const base = num ? `${street}, ${num}` : street;
  return comp ? `${base} - ${comp}` : base;
}

export function parseFullAddressLine(
  fullAddress: string,
  defaultNeighborhood = 'Centro Histórico'
): StructuredAddressValue {
  const raw = (fullAddress || '').trim();
  if (!raw) {
    return {
      cep: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: defaultNeighborhood,
      cityUf: 'Porto Alegre / RS',
    };
  }

  // Split street and number on last comma if right side looks like a number + optional complement
  const commaIdx = raw.indexOf(',');
  if (commaIdx === -1) {
    return {
      cep: '',
      street: raw,
      number: '',
      complement: '',
      neighborhood: defaultNeighborhood,
      cityUf: 'Porto Alegre / RS',
    };
  }

  const streetPart = raw.slice(0, commaIdx).trim();
  const restPart = raw.slice(commaIdx + 1).trim();
  const dashSplit = restPart.split(/\s+-\s+/);
  const numberPart = (dashSplit[0] || '').trim();
  const complementPart = dashSplit.slice(1).join(' - ').trim();

  return {
    cep: '',
    street: streetPart,
    number: numberPart,
    complement: complementPart,
    neighborhood: defaultNeighborhood,
    cityUf: 'Porto Alegre / RS',
  };
}

function parsePhotonFeature(feature: {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}): PhotonSuggestion | null {
  const coords = feature.geometry?.coordinates;
  const props = feature.properties;
  if (!coords || coords.length < 2 || !props) return null;

  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const rawStreet =
    (typeof props.street === 'string' && props.street) ||
    (typeof props.name === 'string' && props.name) ||
    '';
  const street = rawStreet.trim();
  if (!street) return null;

  const housenumber =
    typeof props.housenumber === 'string' ? props.housenumber.trim() : '';
  const neighborhood = (
    (typeof props.district === 'string' && props.district) ||
    (typeof props.suburb === 'string' && props.suburb) ||
    (typeof props.neighbourhood === 'string' && props.neighbourhood) ||
    (typeof props.quarter === 'string' && props.quarter) ||
    ''
  ).trim();

  const city = (
    (typeof props.city === 'string' && props.city) ||
    (typeof props.town === 'string' && props.town) ||
    (typeof props.municipality === 'string' && props.municipality) ||
    (typeof props.county === 'string' && props.county) ||
    'Porto Alegre'
  ).trim();

  const uf = mapStateNameToUf(
    typeof props.state === 'string' ? props.state : undefined
  );
  const cep =
    typeof props.postcode === 'string' ? formatCepMask(props.postcode) : '';

  const labelParts = [
    housenumber ? `${street}, ${housenumber}` : street,
    neighborhood || undefined,
    `${city}/${uf}`,
  ].filter(Boolean);

  return {
    id: `${String(props.osm_id ?? '')}-${lat.toFixed(5)}-${lng.toFixed(5)}-${street}`,
    label: labelParts.join(' · '),
    street,
    housenumber,
    neighborhood,
    city,
    uf,
    cep,
    lat,
    lng,
  };
}

export async function searchPhotonAddresses(
  query: string,
  signal?: AbortSignal
): Promise<PhotonSuggestion[]> {
  const cleaned = query.trim();
  if (cleaned.length < 3) return [];

  const qParam = encodeURIComponent(`${cleaned} Porto Alegre`);
  const url = `https://photon.komoot.io/api/?q=${qParam}&lat=-30.0346&lon=-51.2177&limit=5`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Erro na busca de endereço (${response.status}).`);
  }

  const data = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, unknown>;
    }>;
  };

  if (!Array.isArray(data.features)) return [];

  const seen = new Set<string>();
  const results: PhotonSuggestion[] = [];

  for (const feat of data.features) {
    const parsed = parsePhotonFeature(feat);
    if (!parsed) continue;
    const dedupeKey = `${parsed.street.toLowerCase()}|${parsed.neighborhood.toLowerCase()}|${parsed.city.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push(parsed);
  }

  return results;
}

async function silentGeocodeWithPhoton(
  street: string,
  neighborhood: string,
  city: string
): Promise<{ lat: number; lng: number } | null> {
  const parts = [street, neighborhood, city, 'RS'].filter(Boolean).join(' ');
  if (parts.trim().length < 3) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      parts
    )}&lat=-30.0346&lon=-51.2177&limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
      }>;
    };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function lookupCep(rawCep: string): Promise<CepLookupResult> {
  const cep = onlyCepDigits(rawCep);
  if (cep.length !== 8) {
    return {
      ok: false,
      cep,
      street: '',
      neighborhood: '',
      city: '',
      uf: '',
      errorMessage: 'CEP deve ter 8 dígitos.',
    };
  }

  // 1. Primário: ViaCEP
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as {
          erro?: boolean | string;
          cep?: string;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        };

        if (!data.erro && (data.logradouro || data.localidade)) {
          const street = (data.logradouro || '').trim();
          const neighborhood = (data.bairro || '').trim();
          const city = (data.localidade || '').trim();
          const uf = (data.uf || '').trim().toUpperCase();

          const geo = await silentGeocodeWithPhoton(street, neighborhood, city);

          return {
            ok: true,
            cep: formatCepMask(data.cep || cep),
            street,
            neighborhood,
            city,
            uf,
            lat: geo?.lat,
            lng: geo?.lng,
            source: 'viacep',
          };
        }
      }
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    // Segue para fallback BrasilAPI v2
  }

  // 2. Fallback: BrasilAPI CEP v2
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as {
          cep?: string;
          street?: string;
          neighborhood?: string;
          city?: string;
          state?: string;
          location?: {
            coordinates?: {
              latitude?: string | number;
              longitude?: string | number;
            };
          };
        };

        const street = (data.street || '').trim();
        const neighborhood = (data.neighborhood || '').trim();
        const city = (data.city || '').trim();
        const uf = (data.state || '').trim().toUpperCase();

        const rawLat = Number(data.location?.coordinates?.latitude);
        const rawLng = Number(data.location?.coordinates?.longitude);
        const hasValidCoords =
          Number.isFinite(rawLat) &&
          Number.isFinite(rawLng) &&
          rawLat !== 0 &&
          rawLng !== 0;

        const geo = hasValidCoords
          ? { lat: rawLat, lng: rawLng }
          : await silentGeocodeWithPhoton(street, neighborhood, city);

        return {
          ok: true,
          cep: formatCepMask(data.cep || cep),
          street,
          neighborhood,
          city,
          uf,
          lat: geo?.lat,
          lng: geo?.lng,
          source: 'brasilapi',
        };
      }

      if (res.status === 404) {
        return {
          ok: false,
          cep: formatCepMask(cep),
          street: '',
          neighborhood: '',
          city: '',
          uf: '',
          errorMessage: 'CEP não encontrado. Digite a rua abaixo para buscar.',
        };
      }
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    // Ambos os serviços falharam ou deram timeout
  }

  return {
    ok: false,
    cep: formatCepMask(cep),
    street: '',
    neighborhood: '',
    city: '',
    uf: '',
    errorMessage:
      'Não foi possível consultar o CEP agora. Digite o nome da rua para autocompletar.',
  };
}

/**
 * Calcula distância urbana aproximada em km entre duas coordenadas (Haversine * 1.25).
 */
export function calculateUrbanDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Raio da Terra em km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;
  // Fator de tortuosidade urbana (ruas/avenidas) + arredondamento de 0.5km/0.1km
  const urbanKm = straightKm * 1.25;
  return Math.max(1, Number(urbanKm.toFixed(1)));
}
