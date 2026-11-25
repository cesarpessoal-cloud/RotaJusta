import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Search } from 'lucide-react';
import { POA_NEIGHBORHOODS } from '../constants/portoAlegre';
import {
  formatCepMask,
  formatCityUf,
  lookupCep,
  onlyCepDigits,
  PhotonSuggestion,
  searchPhotonAddresses,
  StructuredAddressValue,
} from '../utils/addressLookup';

interface AddressAutocompleteFieldsProps {
  idPrefix: string;
  sectionLabel?: string;
  value: StructuredAddressValue;
  onChange: (
    next: StructuredAddressValue,
    meta?: { fromLookup?: boolean }
  ) => void;
  compact?: boolean;
  streetPlaceholder?: string;
  complementPlaceholder?: string;
}

export function AddressAutocompleteFields({
  idPrefix,
  sectionLabel,
  value,
  onChange,
  compact = false,
  streetPlaceholder = 'Ex: Rua dos Andradas',
  complementPlaceholder = 'Ex: Apto 302 / Fundos',
}: AddressAutocompleteFieldsProps) {
  const datalistId = useId();
  const numberInputRef = useRef<HTMLInputElement | null>(null);
  const dropdownWrapperRef = useRef<HTMLDivElement | null>(null);
  const latestValueRef = useRef<StructuredAddressValue>(value);
  latestValueRef.current = value;

  const lastLookedUpCepRef = useRef<string>('');
  const skipNextPhotonForStreetRef = useRef<string>('');
  const photonAbortRef = useRef<AbortController | null>(null);

  const [isLookingUpCep, setIsLookingUpCep] = useState(false);
  const [cepStatus, setCepStatus] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const [isSearchingStreet, setIsSearchingStreet] = useState(false);
  const [suggestions, setSuggestions] = useState<PhotonSuggestion[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [streetFocused, setStreetFocused] = useState(false);

  // Fecha a lista suspensa apenas ao tocar/clicar fora do wrapper (mobile-safe)
  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      if (
        dropdownWrapperRef.current &&
        !dropdownWrapperRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setStreetFocused(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, []);

  // Limpa abort controller no unmount
  useEffect(() => {
    return () => {
      photonAbortRef.current?.abort();
    };
  }, []);

  // Busca inteligente Photon com debounce de 400ms a partir de 3 letras
  useEffect(() => {
    const query = value.street.trim();

    if (
      !streetFocused ||
      query.length < 3 ||
      query === skipNextPhotonForStreetRef.current
    ) {
      if (query.length < 3) {
        setSuggestions([]);
        setIsDropdownOpen(false);
      }
      return;
    }

    const timer = window.setTimeout(async () => {
      photonAbortRef.current?.abort();
      const controller = new AbortController();
      photonAbortRef.current = controller;

      setIsSearchingStreet(true);
      try {
        const results = await searchPhotonAddresses(query, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setIsDropdownOpen(results.length > 0);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setIsDropdownOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingStreet(false);
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value.street, streetFocused]);

  const triggerCepLookup = async (digits: string) => {
    if (digits.length !== 8 || lastLookedUpCepRef.current === digits) return;
    lastLookedUpCepRef.current = digits;

    setIsLookingUpCep(true);
    setCepStatus(null);
    try {
      const result = await lookupCep(digits);
      if (onlyCepDigits(latestValueRef.current.cep) !== digits) {
        return;
      }

      if (result.ok) {
        const nextStreet = result.street || latestValueRef.current.street;
        skipNextPhotonForStreetRef.current = nextStreet.trim();
        setSuggestions([]);
        setIsDropdownOpen(false);

        const nextValue: StructuredAddressValue = {
          ...latestValueRef.current,
          cep: result.cep || formatCepMask(digits),
          street: nextStreet,
          neighborhood:
            result.neighborhood || latestValueRef.current.neighborhood,
          cityUf: formatCityUf(result.city, result.uf),
          lat: result.lat ?? latestValueRef.current.lat,
          lng: result.lng ?? latestValueRef.current.lng,
        };

        onChange(nextValue, { fromLookup: true });
        setCepStatus({
          type: 'ok',
          text:
            result.lat !== undefined
              ? 'CEP encontrado e pin atualizado'
              : 'Endereço preenchido pelo CEP',
        });

        // Move foco automaticamente para o campo Número
        window.requestAnimationFrame(() => {
          numberInputRef.current?.focus();
        });
      } else {
        setCepStatus({
          type: 'err',
          text:
            result.errorMessage ||
            'CEP não encontrado. Digite a rua para buscar.',
        });
      }
    } finally {
      setIsLookingUpCep(false);
    }
  };

  const handleCepChange = (raw: string) => {
    const masked = formatCepMask(raw);
    const digits = onlyCepDigits(masked);
    if (digits.length < 8) {
      lastLookedUpCepRef.current = '';
      setCepStatus(null);
    }
    onChange({
      ...value,
      cep: masked,
    });
    if (digits.length === 8) {
      void triggerCepLookup(digits);
    }
  };

  const handleStreetChange = (rawStreet: string) => {
    setStreetFocused(true);
    if (rawStreet.trim() !== skipNextPhotonForStreetRef.current) {
      skipNextPhotonForStreetRef.current = '';
    }
    onChange({
      ...value,
      street: rawStreet,
      // Limpa coordenadas antigas quando usuário digita manualmente uma rua diferente
      lat: undefined,
      lng: undefined,
    });
  };

  const handleSelectSuggestion = (item: PhotonSuggestion) => {
    skipNextPhotonForStreetRef.current = item.street.trim();
    const nextCep = item.cep || value.cep;
    if (onlyCepDigits(nextCep).length === 8) {
      lastLookedUpCepRef.current = onlyCepDigits(nextCep);
    }

    const nextNumber = value.number.trim() || item.housenumber || '';
    const nextValue: StructuredAddressValue = {
      ...value,
      cep: nextCep,
      street: item.street,
      number: nextNumber,
      neighborhood: item.neighborhood || value.neighborhood,
      cityUf: formatCityUf(item.city, item.uf),
      lat: item.lat,
      lng: item.lng,
    };

    setSuggestions([]);
    setIsDropdownOpen(false);
    setStreetFocused(false);
    setCepStatus({
      type: 'ok',
      text: 'Localização exata marcada no mapa',
    });

    onChange(nextValue, { fromLookup: true });

    if (!nextNumber) {
      window.requestAnimationFrame(() => {
        numberInputRef.current?.focus();
      });
    }
  };

  const labelClass = compact
    ? 'block text-[11px] font-medium text-zinc-600 mb-1'
    : 'block text-xs font-semibold text-zinc-700 mb-1.5';
  const inputClass = compact
    ? 'w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none'
    : 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none';

  return (
    <div className="space-y-3">
      {sectionLabel && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-800">
            {sectionLabel}
          </span>
          {value.lat !== undefined && value.lng !== undefined && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              <span>Pin preciso no mapa</span>
            </span>
          )}
        </div>
      )}

      {/* Linha 1: CEP + Rua/Logradouro (com autocomplete Photon) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="sm:col-span-4">
          <label htmlFor={`${idPrefix}-cep`} className={labelClass}>
            CEP (busca automática)
          </label>
          <div className="relative">
            <input
              id={`${idPrefix}-cep`}
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={9}
              value={value.cep}
              onChange={(e) => handleCepChange(e.target.value)}
              placeholder="90010-000"
              className={`${inputClass} font-mono tabular-nums pr-8`}
            />
            {isLookingUpCep && (
              <Loader2
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-emerald-600"
                aria-hidden="true"
              />
            )}
          </div>
          {cepStatus && (
            <p
              className={`mt-1 flex items-center gap-1 text-[11px] leading-tight ${
                cepStatus.type === 'ok' ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {cepStatus.type === 'ok' && (
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span>{cepStatus.text}</span>
            </p>
          )}
        </div>

        <div className="sm:col-span-8 relative" ref={dropdownWrapperRef}>
          <label htmlFor={`${idPrefix}-street`} className={labelClass}>
            Rua / Avenida (ou busque pelo nome)
          </label>
          <div className="relative">
            <input
              id={`${idPrefix}-street`}
              type="text"
              autoComplete="off"
              value={value.street}
              onFocus={() => {
                setStreetFocused(true);
                if (suggestions.length > 0) {
                  setIsDropdownOpen(true);
                }
              }}
              onChange={(e) => handleStreetChange(e.target.value)}
              placeholder={streetPlaceholder}
              className={`${inputClass} pr-8`}
            />
            {isSearchingStreet ? (
              <Loader2
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-emerald-600"
                aria-hidden="true"
              />
            ) : (
              <Search
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
            )}
          </div>

          {isDropdownOpen && suggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Sugestões de endereço em Porto Alegre e Região"
              className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg divide-y divide-zinc-100"
            >
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectSuggestion(item)}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-emerald-50 active:bg-emerald-100 touch-manipulation"
                >
                  <MapPin
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-900 truncate">
                      {item.housenumber
                        ? `${item.street}, ${item.housenumber}`
                        : item.street}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {[
                        item.neighborhood || 'Bairro não informado',
                        `${item.city}/${item.uf}`,
                        item.cep ? `CEP ${item.cep}` : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Linha 2: Número + Complemento + Bairro + Cidade/UF */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="sm:col-span-3">
          <label htmlFor={`${idPrefix}-number`} className={labelClass}>
            Número
          </label>
          <input
            ref={numberInputRef}
            id={`${idPrefix}-number`}
            type="text"
            inputMode="text"
            value={value.number}
            onChange={(e) =>
              onChange({
                ...value,
                number: e.target.value,
              })
            }
            placeholder="Ex: 1234"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-3">
          <label htmlFor={`${idPrefix}-complement`} className={labelClass}>
            Complemento
          </label>
          <input
            id={`${idPrefix}-complement`}
            type="text"
            value={value.complement}
            onChange={(e) =>
              onChange({
                ...value,
                complement: e.target.value,
              })
            }
            placeholder={complementPlaceholder}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-3">
          <label htmlFor={`${idPrefix}-neighborhood`} className={labelClass}>
            Bairro
          </label>
          <input
            id={`${idPrefix}-neighborhood`}
            type="text"
            list={datalistId}
            value={value.neighborhood}
            onChange={(e) =>
              onChange({
                ...value,
                neighborhood: e.target.value,
              })
            }
            placeholder="Ex: Centro Histórico"
            className={inputClass}
          />
          <datalist id={datalistId}>
            {POA_NEIGHBORHOODS.map((bairro) => (
              <option key={bairro} value={bairro} />
            ))}
          </datalist>
        </div>

        <div className="sm:col-span-3">
          <label htmlFor={`${idPrefix}-city`} className={labelClass}>
            Cidade / UF
          </label>
          <input
            id={`${idPrefix}-city`}
            type="text"
            value={value.cityUf}
            onChange={(e) =>
              onChange({
                ...value,
                cityUf: e.target.value,
              })
            }
            placeholder="Porto Alegre / RS"
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
