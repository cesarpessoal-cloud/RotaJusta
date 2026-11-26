import { VehicleType } from '../types';

export type FipeVehicleGroup = 'motos' | 'carros';

export interface FipeBrand {
  codigo: string;
  nome: string;
}

export interface FipeModel {
  codigo: number;
  nome: string;
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

const brandsCache = new Map<FipeVehicleGroup, FipeBrand[]>();
const modelsCache = new Map<string, FipeModel[]>();

export function getFipeGroupForVehicleType(
  vehicleType?: VehicleType | null
): FipeVehicleGroup | null {
  if (vehicleType === 'Moto') return 'motos';
  if (
    vehicleType === 'Carro Pequeno (Passeio)' ||
    vehicleType === 'Utilitário / Picape / Van'
  ) {
    return 'carros';
  }
  return null;
}

export function formatFipeBrandLabel(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return '';
  // Parallelum sometimes returns uppercase names (e.g. "HONDA", "YAMAHA", "FIAT")
  // Preserve short acronyms or mixed-case strings like "VW - VolksWagen" or "BMW"
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
): Promise<FipeBrand[]> {
  const cached = brandsCache.get(group);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://parallelum.com.br/fipe/api/v1/${group}/marcas`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      throw new Error(`FIPE HTTP ${res.status}`);
    }
    const data = (await res.json()) as FipeBrand[];
    const list = Array.isArray(data)
      ? data.filter((b) => b && b.codigo && b.nome)
      : [];
    brandsCache.set(group, list);
    return list;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchFipeModels(
  group: FipeVehicleGroup,
  brandCode: string
): Promise<FipeModel[]> {
  const cacheKey = `${group}:${brandCode}`;
  const cached = modelsCache.get(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://parallelum.com.br/fipe/api/v1/${group}/marcas/${encodeURIComponent(
        brandCode
      )}/modelos`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      throw new Error(`FIPE HTTP ${res.status}`);
    }
    const data = (await res.json()) as { modelos?: FipeModel[] };
    const list = Array.isArray(data?.modelos)
      ? data.modelos.filter((m) => m && m.nome)
      : [];
    modelsCache.set(cacheKey, list);
    return list;
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
