import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { VehicleType } from '../types';
import { formatPlateInput } from '../utils/courierIdentity';
import {
  BIKE_STANDARD_MODELS,
  combineFipeBrandAndModel,
  CUSTOM_MODEL_OPTION_VALUE,
  fetchFipeBrands,
  fetchFipeModels,
  FipeBrand,
  FipeModel,
  formatFipeBrandLabel,
  getFipeGroupForVehicleType,
  matchStandardColorOption,
  VEHICLE_COLOR_OPTIONS,
} from '../utils/fipeApi';

interface FipeVehicleFieldsProps {
  idPrefix: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
  onChangeVehicleModel: (nextModel: string) => void;
  onChangeVehicleColor: (nextColor: string) => void;
  onChangePlate: (nextPlate: string) => void;
  required?: boolean;
  plateRequired?: boolean;
}

export function FipeVehicleFields({
  idPrefix,
  vehicleType,
  vehicleModel,
  vehicleColor,
  plate,
  onChangeVehicleModel,
  onChangeVehicleColor,
  onChangePlate,
  required = true,
  plateRequired = true,
}: FipeVehicleFieldsProps) {
  const fipeGroup = getFipeGroupForVehicleType(vehicleType);
  const isBike = vehicleType === 'Bike';

  // Bike standardized options state
  const [bikeOption, setBikeOption] = useState<string>(() => {
    const clean = vehicleModel.trim();
    if (!clean) return '';
    const match = BIKE_STANDARD_MODELS.find(
      (opt) => opt.toLowerCase() === clean.toLowerCase()
    );
    return match || CUSTOM_MODEL_OPTION_VALUE;
  });
  const [customBikeInput, setCustomBikeInput] = useState<string>(() => {
    const clean = vehicleModel.trim();
    if (
      clean &&
      !BIKE_STANDARD_MODELS.some(
        (opt) => opt.toLowerCase() === clean.toLowerCase()
      )
    ) {
      return clean;
    }
    return '';
  });

  // Campo 2 (Marca / Fabricante) & Campo 3 (Modelo) states
  const [brands, setBrands] = useState<FipeBrand[]>([]);
  const [brandSearch, setBrandSearch] = useState<string>('');
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [brandsUsingFallback, setBrandsUsingFallback] = useState(false);
  const [selectedBrandCode, setSelectedBrandCode] = useState<string>('');

  const [models, setModels] = useState<FipeModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsUsingFallback, setModelsUsingFallback] = useState(false);
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [customManualModel, setCustomManualModel] = useState<string>('');

  // Campo 4 (Cor do Veículo) state
  const initialColor = matchStandardColorOption(vehicleColor);
  const [colorOption, setColorOption] = useState<string>(
    initialColor.selectedOption
  );
  const [customColorInput, setCustomColorInput] = useState<string>(
    initialColor.customColor
  );

  const lastVehicleTypeRef = useRef<VehicleType>(vehicleType);
  const latestModelRef = useRef<string>(vehicleModel);
  latestModelRef.current = vehicleModel;

  // Keep Color dropdown synced when editing different users
  useEffect(() => {
    const matched = matchStandardColorOption(vehicleColor);
    setColorOption(matched.selectedOption);
    setCustomColorInput(matched.customColor);
  }, [vehicleColor]);

  // Keep Bike selection synced
  useEffect(() => {
    if (!isBike) return;
    const clean = vehicleModel.trim();
    if (!clean) {
      setBikeOption('');
      setCustomBikeInput('');
      return;
    }
    const exact = BIKE_STANDARD_MODELS.find(
      (opt) => opt.toLowerCase() === clean.toLowerCase()
    );
    if (exact) {
      setBikeOption(exact);
      setCustomBikeInput('');
    } else {
      setBikeOption(CUSTOM_MODEL_OPTION_VALUE);
      setCustomBikeInput(clean);
    }
  }, [isBike, vehicleModel]);

  // Reset Brand/Model dropdowns when switching between Moto / Carro / Bike
  useEffect(() => {
    if (lastVehicleTypeRef.current !== vehicleType) {
      const prevGroup = getFipeGroupForVehicleType(lastVehicleTypeRef.current);
      const nextGroup = getFipeGroupForVehicleType(vehicleType);
      lastVehicleTypeRef.current = vehicleType;

      if (prevGroup !== nextGroup) {
        setSelectedBrandCode('');
        setBrandSearch('');
        setModels([]);
        setSelectedModelName('');
        setCustomManualModel('');
      }
    }
  }, [vehicleType]);

  // Load FIPE v2 Brands (with instant local fallback after <= 3s)
  useEffect(() => {
    if (!fipeGroup) {
      setBrands([]);
      setIsLoadingBrands(false);
      setBrandsUsingFallback(false);
      return;
    }

    let cancelled = false;
    setIsLoadingBrands(true);

    fetchFipeBrands(fipeGroup)
      .then(({ brands: list, usedFallback }) => {
        if (cancelled) return;
        setBrands(list);
        setBrandsUsingFallback(usedFallback);

        const existing = latestModelRef.current.trim();
        if (existing) {
          const matchedBrand = list.find((b) => {
            const rawLower = b.name.trim().toLowerCase();
            const fmtLower = formatFipeBrandLabel(b.name).toLowerCase();
            const exLower = existing.toLowerCase();
            return (
              exLower === rawLower ||
              exLower === fmtLower ||
              exLower.startsWith(`${rawLower} `) ||
              exLower.startsWith(`${fmtLower} `)
            );
          });
          if (matchedBrand) {
            setSelectedBrandCode(matchedBrand.code);
          } else {
            setSelectedBrandCode(CUSTOM_MODEL_OPTION_VALUE);
            setCustomManualModel(existing);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBrands(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fipeGroup]);

  const selectedBrandObj = useMemo(
    () => brands.find((b) => b.code === selectedBrandCode) || null,
    [brands, selectedBrandCode]
  );

  // Load FIPE v2 Models when Brand is selected (with instant local fallback after <= 3s)
  useEffect(() => {
    if (
      !fipeGroup ||
      !selectedBrandCode ||
      selectedBrandCode === CUSTOM_MODEL_OPTION_VALUE ||
      !selectedBrandObj
    ) {
      setModels([]);
      setIsLoadingModels(false);
      setModelsUsingFallback(false);
      return;
    }

    let cancelled = false;
    setIsLoadingModels(true);

    fetchFipeModels(fipeGroup, selectedBrandCode, selectedBrandObj.name)
      .then(({ models: list, usedFallback }) => {
        if (cancelled) return;
        setModels(list);
        setModelsUsingFallback(usedFallback);

        const existing = latestModelRef.current.trim();
        if (existing) {
          const exactModel = list.find(
            (m) =>
              combineFipeBrandAndModel(
                selectedBrandObj.name,
                m.name
              ).toLowerCase() === existing.toLowerCase() ||
              m.name.trim().toLowerCase() === existing.toLowerCase()
          );
          if (exactModel) {
            setSelectedModelName(exactModel.name);
          } else {
            const rawPrefix = `${selectedBrandObj.name.trim()} `;
            const fmtPrefix = `${formatFipeBrandLabel(
              selectedBrandObj.name
            )} `;
            let stripped = existing;
            if (existing.toLowerCase().startsWith(fmtPrefix.toLowerCase())) {
              stripped = existing.slice(fmtPrefix.length).trim();
            } else if (
              existing.toLowerCase().startsWith(rawPrefix.toLowerCase())
            ) {
              stripped = existing.slice(rawPrefix.length).trim();
            }
            const closeMatch = list.find(
              (m) => m.name.trim().toLowerCase() === stripped.toLowerCase()
            );
            if (closeMatch) {
              setSelectedModelName(closeMatch.name);
            } else if (
              stripped &&
              stripped.toLowerCase() !==
                selectedBrandObj.name.trim().toLowerCase()
            ) {
              setSelectedModelName(CUSTOM_MODEL_OPTION_VALUE);
              setCustomManualModel(existing);
            }
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fipeGroup, selectedBrandCode, selectedBrandObj]);

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => {
      const label = formatFipeBrandLabel(b.name).toLowerCase();
      return label.includes(q) || b.name.toLowerCase().includes(q);
    });
  }, [brands, brandSearch]);

  const handleBrandSelectChange = (nextCode: string) => {
    setSelectedBrandCode(nextCode);
    setSelectedModelName('');
    if (nextCode === CUSTOM_MODEL_OPTION_VALUE) {
      const fallbackText = customManualModel.trim() || vehicleModel.trim();
      setCustomManualModel(fallbackText);
      onChangeVehicleModel(fallbackText);
      return;
    }
    if (!nextCode) {
      onChangeVehicleModel('');
      return;
    }
    onChangeVehicleModel('');
  };

  const handleModelSelectChange = (nextModel: string) => {
    setSelectedModelName(nextModel);
    if (nextModel === CUSTOM_MODEL_OPTION_VALUE) {
      const prefill =
        customManualModel.trim() ||
        (selectedBrandObj
          ? `${formatFipeBrandLabel(selectedBrandObj.name)} `
          : '');
      setCustomManualModel(prefill);
      onChangeVehicleModel(prefill.trim());
      return;
    }
    if (!nextModel) {
      onChangeVehicleModel('');
      return;
    }
    const combined = selectedBrandObj
      ? combineFipeBrandAndModel(selectedBrandObj.name, nextModel)
      : nextModel;
    onChangeVehicleModel(combined);
  };

  const handleColorOptionChange = (nextOpt: string) => {
    setColorOption(nextOpt);
    if (!nextOpt) {
      setCustomColorInput('');
      onChangeVehicleColor('');
      return;
    }
    if (nextOpt === 'Outra') {
      onChangeVehicleColor(customColorInput.trim() || 'Outra');
      return;
    }
    setCustomColorInput('');
    onChangeVehicleColor(nextOpt);
  };

  const isCustomBrand = selectedBrandCode === CUSTOM_MODEL_OPTION_VALUE;
  const isCustomModel =
    !isCustomBrand && selectedModelName === CUSTOM_MODEL_OPTION_VALUE;

  return (
    <div className="space-y-3">
      {isBike ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${idPrefix}-bike-model`}
              className="block text-[11px] font-semibold text-zinc-700 mb-1"
            >
              Modelo da Bicicleta{' '}
              {required && <span className="text-red-600">*</span>}
            </label>
            <select
              id={`${idPrefix}-bike-model`}
              value={bikeOption}
              onChange={(e) => {
                const next = e.target.value;
                setBikeOption(next);
                if (next === CUSTOM_MODEL_OPTION_VALUE) {
                  onChangeVehicleModel(customBikeInput.trim());
                } else {
                  setCustomBikeInput('');
                  onChangeVehicleModel(next);
                }
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="">Selecione o tipo de bicicleta...</option>
              {BIKE_STANDARD_MODELS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              <option value={CUSTOM_MODEL_OPTION_VALUE}>
                Outro modelo (digitar manualmente)
              </option>
            </select>
          </div>

          {bikeOption === CUSTOM_MODEL_OPTION_VALUE && (
            <div>
              <label
                htmlFor={`${idPrefix}-bike-custom`}
                className="block text-[11px] font-semibold text-zinc-700 mb-1"
              >
                Digite o Modelo da Bicicleta{' '}
                {required && <span className="text-red-600">*</span>}
              </label>
              <input
                id={`${idPrefix}-bike-custom`}
                type="text"
                value={customBikeInput}
                onChange={(e) => {
                  setCustomBikeInput(e.target.value);
                  onChangeVehicleModel(e.target.value);
                }}
                placeholder="Ex: Caloi E-Vibe"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor={`${idPrefix}-vehicle-color`}
              className="block text-[11px] font-semibold text-zinc-700 mb-1"
            >
              Cor da Bicicleta{' '}
              {required && <span className="text-red-600">*</span>}
            </label>
            <select
              id={`${idPrefix}-vehicle-color`}
              value={colorOption}
              onChange={(e) => handleColorOptionChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="">Selecione a cor...</option>
              {VEHICLE_COLOR_OPTIONS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>

          {colorOption === 'Outra' && (
            <div>
              <label
                htmlFor={`${idPrefix}-vehicle-color-custom`}
                className="block text-[11px] font-semibold text-zinc-700 mb-1"
              >
                Especifique a cor
              </label>
              <input
                id={`${idPrefix}-vehicle-color-custom`}
                type="text"
                value={customColorInput}
                onChange={(e) => {
                  setCustomColorInput(e.target.value);
                  onChangeVehicleColor(e.target.value.trim() || 'Outra');
                }}
                placeholder="Ex: Laranja"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Campo 2 — Marca / Fabricante (sempre antes do Modelo) */}
          <div className="space-y-1.5">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <label
                htmlFor={`${idPrefix}-fipe-brand`}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700"
              >
                <span>
                  Marca / Fabricante{' '}
                  {required && <span className="text-red-600">*</span>}
                </span>
                {isLoadingBrands && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                    <Loader2
                      className="h-3 w-3 animate-spin"
                      aria-hidden="true"
                    />
                    <span>Consultando FIPE...</span>
                  </span>
                )}
              </label>

              {brands.length > 8 && (
                <div className="relative sm:w-44">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                    placeholder="Filtrar marca..."
                    aria-label="Filtrar marca do veículo"
                    className="w-full rounded-md border border-zinc-200 bg-white pl-6 pr-2 py-1 text-[11px] text-zinc-800 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <select
              id={`${idPrefix}-fipe-brand`}
              value={selectedBrandCode}
              onChange={(e) => handleBrandSelectChange(e.target.value)}
              disabled={isLoadingBrands && brands.length === 0}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none disabled:bg-zinc-100"
            >
              <option value="">
                {isLoadingBrands
                  ? 'Carregando marcas...'
                  : 'Selecione a marca / fabricante...'}
              </option>
              {filteredBrands.map((b) => (
                <option key={b.code} value={b.code}>
                  {formatFipeBrandLabel(b.name)}
                </option>
              ))}
              <option value={CUSTOM_MODEL_OPTION_VALUE}>
                Outro modelo (digitar manualmente)
              </option>
            </select>
          </div>

          {/* Campo 3 — Modelo do Veículo (carregado após escolher Marca) */}
          {!isCustomBrand && (
            <div>
              <label
                htmlFor={`${idPrefix}-fipe-model`}
                className="flex items-center justify-between text-[11px] font-semibold text-zinc-700 mb-1"
              >
                <span>
                  Modelo do Veículo{' '}
                  {required && <span className="text-red-600">*</span>}
                </span>
                {isLoadingModels && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                    <Loader2
                      className="h-3 w-3 animate-spin"
                      aria-hidden="true"
                    />
                    <span>Carregando modelos...</span>
                  </span>
                )}
              </label>
              <select
                id={`${idPrefix}-fipe-model`}
                value={selectedModelName}
                onChange={(e) => handleModelSelectChange(e.target.value)}
                disabled={!selectedBrandCode || isLoadingModels}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-500"
              >
                <option value="">
                  {!selectedBrandCode
                    ? 'Escolha a Marca / Fabricante primeiro'
                    : isLoadingModels
                    ? 'Buscando modelos...'
                    : 'Selecione o modelo oficial...'}
                </option>
                {models.map((m) => (
                  <option key={`${m.code}-${m.name}`} value={m.name}>
                    {m.name}
                  </option>
                ))}
                <option value={CUSTOM_MODEL_OPTION_VALUE}>
                  Outro modelo (digitar manualmente)
                </option>
              </select>
            </div>
          )}

          {(brandsUsingFallback || modelsUsingFallback) && (
            <p className="text-[11px] text-zinc-500">
              Lista local rápida ativa para seleção imediata. Caso não encontre,
              escolha &ldquo;Outro modelo (digitar manualmente)&rdquo;.
            </p>
          )}

          {(isCustomBrand || isCustomModel) && (
            <div>
              <label
                htmlFor={`${idPrefix}-fipe-custom-model`}
                className="block text-[11px] font-semibold text-zinc-700 mb-1"
              >
                Digite Marca e Modelo do Veículo{' '}
                {required && <span className="text-red-600">*</span>}
              </label>
              <input
                id={`${idPrefix}-fipe-custom-model`}
                type="text"
                value={customManualModel}
                onChange={(e) => {
                  setCustomManualModel(e.target.value);
                  onChangeVehicleModel(e.target.value);
                }}
                placeholder={
                  vehicleType === 'Moto'
                    ? 'Ex: Honda CG 160 Titan'
                    : 'Ex: Fiat Fiorino 1.4'
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}

          {/* Campo 4 — Cor do Veículo & Campo 5 — Placa do Veículo */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${idPrefix}-vehicle-color`}
                className="block text-[11px] font-semibold text-zinc-700 mb-1"
              >
                Cor do Veículo{' '}
                {required && <span className="text-red-600">*</span>}
              </label>
              <select
                id={`${idPrefix}-vehicle-color`}
                value={colorOption}
                onChange={(e) => handleColorOptionChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
              >
                <option value="">Selecione a cor...</option>
                {VEHICLE_COLOR_OPTIONS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`${idPrefix}-vehicle-plate`}
                className="block text-[11px] font-semibold text-zinc-700 mb-1"
              >
                Placa do Veículo{' '}
                {plateRequired && <span className="text-red-600">*</span>}
              </label>
              <input
                id={`${idPrefix}-vehicle-plate`}
                type="text"
                maxLength={8}
                value={plate}
                onChange={(e) => onChangePlate(formatPlateInput(e.target.value))}
                placeholder="ABC1D23"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-zinc-900 placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          {colorOption === 'Outra' && (
            <div>
              <label
                htmlFor={`${idPrefix}-vehicle-color-custom`}
                className="block text-[11px] font-semibold text-zinc-700 mb-1"
              >
                Especifique a cor
              </label>
              <input
                id={`${idPrefix}-vehicle-color-custom`}
                type="text"
                value={customColorInput}
                onChange={(e) => {
                  setCustomColorInput(e.target.value);
                  onChangeVehicleColor(e.target.value.trim() || 'Outra');
                }}
                placeholder="Ex: Marrom / Bege"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
