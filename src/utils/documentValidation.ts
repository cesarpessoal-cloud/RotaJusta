import { PersonType } from '../types';

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCpfMask(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCnpjMask(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCpfOrCnpj(
  value?: string | null,
  personType?: PersonType
): string {
  const digits = onlyDigits(value || '');
  if (!digits) return '';
  if (personType === 'PJ' || digits.length > 11) {
    return formatCnpjMask(digits);
  }
  return formatCpfMask(digits);
}

/**
 * Validação matemática oficial de CPF (Módulo 11).
 * Rejeita sequências com todos os dígitos repetidos e valida os 2 dígitos verificadores.
 */
export function isValidCpf(raw: string): boolean {
  const digits = onlyDigits(raw);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const nums = digits.split('').map(Number);

  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += nums[i] * (10 - i);
  }
  const rem1 = (sum1 * 10) % 11;
  const check1 = rem1 === 10 ? 0 : rem1;
  if (check1 !== nums[9]) return false;

  let sum2 = 0;
  for (let i = 0; i < 10; i++) {
    sum2 += nums[i] * (11 - i);
  }
  const rem2 = (sum2 * 10) % 11;
  const check2 = rem2 === 10 ? 0 : rem2;
  return check2 === nums[10];
}

/**
 * Validação matemática oficial de CNPJ (Módulo 11).
 * Rejeita sequências com todos os dígitos repetidos e valida os 2 dígitos verificadores.
 */
export function isValidCnpj(raw: string): boolean {
  const digits = onlyDigits(raw);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const nums = digits.split('').map(Number);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += nums[i] * weights1[i];
  }
  const rem1 = sum1 % 11;
  const check1 = rem1 < 2 ? 0 : 11 - rem1;
  if (check1 !== nums[12]) return false;

  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += nums[i] * weights2[i];
  }
  const rem2 = sum2 % 11;
  const check2 = rem2 < 2 ? 0 : 11 - rem2;
  return check2 === nums[13];
}

export interface CnpjLookupResult {
  ok: boolean;
  isActive: boolean;
  statusText: string;
  companyLegalName: string;
  tradeName: string;
  errorMessage?: string;
}

interface BrasilApiCnpjResponse {
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: number;
  message?: string;
}

export async function lookupCnpjBrasilApi(
  rawCnpj: string
): Promise<CnpjLookupResult> {
  const digits = onlyDigits(rawCnpj);
  if (!isValidCnpj(digits)) {
    return {
      ok: false,
      isActive: false,
      statusText: 'INVÁLIDO',
      companyLegalName: '',
      tradeName: '',
      errorMessage: 'CNPJ matematicamente inválido. Confira os 14 dígitos.',
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );

    if (response.status === 404) {
      return {
        ok: false,
        isActive: false,
        statusText: 'NÃO ENCONTRADO',
        companyLegalName: '',
        tradeName: '',
        errorMessage: 'CNPJ não encontrado na base da Receita Federal.',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        isActive: false,
        statusText: 'INDISPONÍVEL',
        companyLegalName: '',
        tradeName: '',
        errorMessage: `Não foi possível consultar o CNPJ na BrasilAPI (HTTP ${response.status}).`,
      };
    }

    const data = (await response.json()) as BrasilApiCnpjResponse;
    const statusText = (
      data.descricao_situacao_cadastral ||
      (data.situacao_cadastral === 2 ? 'ATIVA' : '')
    )
      .trim()
      .toUpperCase();

    const isActive =
      statusText === 'ATIVA' || data.situacao_cadastral === 2;
    const companyLegalName = (data.razao_social || '').trim();
    const tradeName = (data.nome_fantasia || '').trim();

    if (!isActive) {
      return {
        ok: true,
        isActive: false,
        statusText: statusText || 'INATIVA',
        companyLegalName,
        tradeName,
        errorMessage: `CNPJ com situação cadastral "${statusText || 'INATIVA'}" na Receita Federal. Apenas empresas ATIVAS podem se cadastrar.`,
      };
    }

    return {
      ok: true,
      isActive: true,
      statusText: 'ATIVA',
      companyLegalName: companyLegalName || tradeName,
      tradeName,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      isActive: false,
      statusText: 'ERRO_REDE',
      companyLegalName: '',
      tradeName: '',
      errorMessage: isAbort
        ? 'Tempo esgotado ao consultar a BrasilAPI. Tente novamente.'
        : 'Falha de conexão ao consultar a BrasilAPI para validar o CNPJ.',
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
