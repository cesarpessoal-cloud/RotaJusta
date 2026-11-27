import { VehicleType } from '../types';

export type FipeVehicleGroup = 'motorcycles' | 'cars';

export interface FipeBrand {
  code: string;
  name: string;
}

export interface FipeModel {
  code: string;
  name: string;
}

export const BIKE_STANDARD_MODELS = [
  'Bicicleta Comum',
  'Bicicleta Elétrica',
  'Bicicleta Cargueira',
] as const;

export const VEHICLE_COLOR_OPTIONS = [
  'Preta',
  'Branca',
  'Prata',
  'Cinza',
  'Vermelha',
  'Azul',
  'Verde',
  'Amarela',
  'Outra',
] as const;

export const CUSTOM_MODEL_OPTION_VALUE = '__OTHER__';

const FIPE_V2_BASE = 'https://fipe.parallelum.com.br/api/v2';
const FIPE_TIMEOUT_MS = 3000;

const brandsCache = new Map<FipeVehicleGroup, FipeBrand[]>();
const modelsCache = new Map<string, FipeModel[]>();

const LOCAL_FALLBACK_MOTORCYCLE_BRANDS: FipeBrand[] = [
  { code: 'local-moto-honda', name: 'Honda' },
  { code: 'local-moto-yamaha', name: 'Yamaha' },
  { code: 'local-moto-suzuki', name: 'Suzuki' },
  { code: 'local-moto-mottu', name: 'Mottu' },
  { code: 'local-moto-shineray', name: 'Shineray' },
  { code: 'local-moto-bajaj', name: 'Bajaj' },
  { code: 'local-moto-haojue', name: 'Haojue' },
];

const LOCAL_FALLBACK_CAR_BRANDS: FipeBrand[] = [
  { code: 'local-car-fiat', name: 'Fiat' },
  { code: 'local-car-volkswagen', name: 'Volkswagen' },
  { code: 'local-car-chevrolet', name: 'Chevrolet' },
  { code: 'local-car-renault', name: 'Renault' },
  { code: 'local-car-hyundai', name: 'Hyundai' },
  { code: 'local-car-ford', name: 'Ford' },
  { code: 'local-car-toyota', name: 'Toyota' },
  { code: 'local-car-peugeot', name: 'Peugeot' },
  { code: 'local-car-citroen', name: 'Citroën' },
];

const LOCAL_FALLBACK_MODELS_BY_BRAND_NAME: Record<string, string[]> = {
  honda: [
    'CG 160 Titan',
    'CG 160 Fan',
    'CG 160 Start',
    'CG 160 Cargo',
    'Biz 125',
    'Pop 110i',
    'NXR 160 Bros',
    'CB 300F Twister',
    'PCX 160',
    'XRE 190',
  ],
  yamaha: [
    'Fazer 150 UBS',
    'Factor 150',
    'Factor 125i',
    'Crosser 150',
    'FZ25 Fazer 250',
    'Lander 250',
    'NMax 160',
    'Neo 125',
    'Fluo 125',
  ],
  suzuki: [
    'Intruder 125',
    'Burgman i 125',
    'Yes 125',
    'GSR 150i',
    'GSX-S150',
  ],
  mottu: [
    'Mottu Sport 110i',
    'Mottu Pop 110',
    'Mottu-E (Elétrica)',
  ],
  shineray: [
    'Worker 125',
    'JEF 150s',
    'XY 150 Explorer',
    'SE1 (Elétrica)',
    'SHE-S (Elétrica)',
  ],
  bajaj: [
    'Dominar 160',
    'Dominar 200',
    'Dominar 400',
    'Pulsar N150',
  ],
  haojue: [
    'DK 150',
    'DK 160',
    'Chopper Road 150',
    'Lindyr 125',
    'NK 150',
  ],
  fiat: [
    'Fiorino Endurance 1.4',
    'Strada Endurance 1.4',
    'Strada Freedom 1.3',
    'Mobi Like 1.0',
    'Argo Drive 1.0',
    'Uno Vivace 1.0',
    'Doblò Cargo 1.8',
    'Ducato Cargo',
  ],
  volkswagen: [
    'Saveiro Robust 1.6',
    'Gol 1.0',
    'Polo Track 1.0',
    'Voyage 1.6',
    'Up! Take 1.0',
    'Kombi Furgão',
    'Delivery Express',
  ],
  chevrolet: [
    'Onix Joy 1.0',
    'Onix Plus 1.0',
    'Montana LS 1.4',
    'Montana 1.2 Turbo',
    'Prisma 1.0',
    'Spin 1.8',
  ],
  renault: [
    'Kangoo Express 1.6',
    'Kwid Zen 1.0',
    'Sandero 1.0',
    'Logan 1.6',
    'Oroch Pro 1.6',
    'Master Furgão',
  ],
  hyundai: [
    'HB20 Sense 1.0',
    'HB20S 1.0',
    'HR Baú 2.5',
    'Creta 1.6',
  ],
  ford: [
    'Ka Hatch 1.0',
    'Ka Sedan 1.5',
    'Courier 1.6',
    'Transit Furgão',
    'Ranger XL',
  ],
  toyota: [
    'Etios Hatch 1.3',
    'Yaris XL 1.5',
    'Corolla GLi',
    'Hilux Cabine Simples',
  ],
  peugeot: [
    'Partner Rapid 1.4',
    'Partner Furgão 1.6',
    '208 Like 1.0',
    'Boxer Furgão',
    'Expert Furgão',
  ],
  citroen: [
    'Berlingo Furgão 1.6',
    'C3 Live 1.0',
    'Jumpy Cargo',
    'Jumper Furgão',
  ],
};

function normalizeBrandKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getLocalFallbackBrands(group: FipeVehicleGroup): FipeBrand[] {
  return group === 'motorcycles'
    ? LOCAL_FALLBACK_MOTORCYCLE_BRANDS
    : LOCAL_FALLBACK_CAR_BRANDS;
}

export function getLocalFallbackModelsForBrand(
  brandName: string,
  group: FipeVehicleGroup
): FipeModel[] {
  const normalized = normalizeBrandKey(brandName);
  const directKey = Object.keys(LOCAL_FALLBACK_MODELS_BY_BRAND_NAME).find(
    (k) => normalized === k || normalized.includes(k)
  );
  if (directKey) {
    return LOCAL_FALLBACK_MODELS_BY_BRAND_NAME[directKey].map((name, idx) => ({
      code: `local-model-${directKey}-${idx}`,
      name,
    }));
  }

  const generic =
    group === 'motorcycles'
      ? ['Modelo Urbano 125/160cc', 'Scooter / Elétrica']
      : ['Hatch / Sedan Compacto', 'Utilitário / Furgão'];
  return generic.map((name, idx) => ({
    code: `local-model-generic-${idx}`,
    name,
  }));
}

export function getFipeGroupForVehicleType(
  vehicleType?: VehicleType | null
): FipeVehicleGroup | null {
  if (vehicleType === 'Moto') return 'motorcycles';
  if (
    vehicleType === 'Carro Pequeno (Passeio)' ||
    vehicleType === 'Utilitário / Picape / Van'
  ) {
    return 'cars';
  }
  return null;
}

export function formatFipeBrandLabel(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return '';
  if (/^[A-Z0-9\s/-]+$/.test(trimmed) && trimmed.length > 3) {
    return trimmed
      .toLowerCase()
      .replace(/(^|\s|\/|-)([a-zà-ÿ])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
  }
  return trimmed;
}

export function combineFipeBrandAndModel(
  brandName: string,
  modelName: string
): string {
  const cleanBrand = formatFipeBrandLabel(brandName);
  const cleanModel = modelName.trim();
  if (!cleanBrand) return cleanModel;
  if (!cleanModel) return cleanBrand;

  const lowerBrand = cleanBrand.toLowerCase();
  const lowerModel = cleanModel.toLowerCase();
  if (lowerModel.startsWith(lowerBrand)) {
    return cleanModel;
  }
  return `${cleanBrand} ${cleanModel}`;
}

export async function fetchFipeBrands(
  group: FipeVehicleGroup
): Promise<{ brands: FipeBrand[]; usedFallback: boolean }> {
  const cached = brandsCache.get(group);
  if (cached) {
    return { brands: cached, usedFallback: false };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FIPE_TIMEOUT_MS);
  try {
    const res = await fetch(`${FIPE_V2_BASE}/${group}/brands`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`FIPE HTTP ${res.status}`);
    }
    const raw = (await res.json()) as Array<{ code?: string | number; name?: string }>;
    const list: FipeBrand[] = Array.isArray(raw)
      ? raw
          .filter((b) => b && b.code !== undefined && b.name)
          .map((b) => ({
            code: String(b.code),
            name: String(b.name).trim(),
          }))
      : [];

    if (list.length === 0) {
      throw new Error('FIPE empty brands list');
    }

    // Ensure key brands like Mottu / Shineray / Bajaj are easy to find if missing from FIPE
    const existingNames = new Set(list.map((b) => normalizeBrandKey(b.name)));
    const extras = getLocalFallbackBrands(group).filter(
      (fb) => !existingNames.has(normalizeBrandKey(fb.name))
    );
    const merged = [...list, ...extras];
    brandsCache.set(group, merged);
    return { brands: merged, usedFallback: false };
  } catch {
    const fallback = getLocalFallbackBrands(group);
    return { brands: fallback, usedFallback: true };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchFipeModels(
  group: FipeVehicleGroup,
  brandCode: string,
  brandName: string
): Promise<{ models: FipeModel[]; usedFallback: boolean }> {
  if (brandCode.startsWith('local-')) {
    return {
      models: getLocalFallbackModelsForBrand(brandName, group),
      usedFallback: true,
    };
  }

  const cacheKey = `${group}:${brandCode}`;
  const cached = modelsCache.get(cacheKey);
  if (cached) {
    return { models: cached, usedFallback: false };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FIPE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${FIPE_V2_BASE}/${group}/brands/${encodeURIComponent(brandCode)}/models`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      throw new Error(`FIPE HTTP ${res.status}`);
    }
    const raw = (await res.json()) as Array<{ code?: string | number; name?: string }>;
    const list: FipeModel[] = Array.isArray(raw)
      ? raw
          .filter((m) => m && m.name)
          .map((m, idx) => ({
            code: String(m.code ?? idx),
            name: String(m.name).trim(),
          }))
      : [];

    if (list.length === 0) {
      throw new Error('FIPE empty models list');
    }

    modelsCache.set(cacheKey, list);
    return { models: list, usedFallback: false };
  } catch {
    return {
      models: getLocalFallbackModelsForBrand(brandName, group),
      usedFallback: true,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function matchStandardColorOption(color?: string | null): {
  selectedOption: string;
  customColor: string;
} {
  const clean = (color || '').trim();
  if (!clean) {
    return { selectedOption: '', customColor: '' };
  }
  const found = VEHICLE_COLOR_OPTIONS.find(
    (opt) => opt !== 'Outra' && opt.toLowerCase() === clean.toLowerCase()
  );
  if (found) {
    return { selectedOption: found, customColor: '' };
  }
  if (clean.toLowerCase() === 'outra') {
    return { selectedOption: 'Outra', customColor: '' };
  }
  return { selectedOption: 'Outra', customColor: clean };
}
