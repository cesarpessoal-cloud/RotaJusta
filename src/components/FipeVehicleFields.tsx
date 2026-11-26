import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
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

  // Bike state
  const [bikeOption, setBikeOption] = useState<string>(() => {
    const clean = vehicleModel.trim();
    if (!clean) return '';
    return BIKE_STANDARD_MODELS.includes(
      clean as (typeof BIKE_STANDARD_MODELS)[number]
    )
      ? clean
      : CUSTOM_MODEL_OPTION_VALUE;
  });
  const [customBikeInput, setCustomBikeInput] = useState<string>(() => {
    const clean = vehicleModel.trim();
    if (
      clean &&
      !BIKE_STANDARD_MODELS.includes(
        clean as (typeof BIKE_STANDARD_MODELS)[number]
      )
    ) {
      return clean;
    }
    return '';
  });

  // FIPE Brands & Models state
  const [brands, setBrands] = useState<FipeBrand[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [fipeBrandsError, setFipeBrandsError] = useState<string | null>(null);
  const [selectedBrandCode, setSelectedBrandCode] = useState<string>('');

  const [models, setModels] = useState<FipeModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [fipeModelsError, setFipeModelsError] = useState<string | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [customManualModel, setCustomManualModel] = useState<string>('');

  // Color state
  const initialColor = matchStandardColorOption(vehicleColor);
  const [colorOption, setColorOption] = useState<string>(
    initialColor.selectedOption
  );
  const [customColorInput, setCustomColorInput] = useState<string>(
    initialColor.customColor
  );

  // Track last synced external vehicleModel & vehicleType so re-opening edit modals stays in sync
  const lastVehicleTypeRef = useRef<VehicleType>(vehicleType);
  const latestModelRef = useRef<string>(vehicleModel);
  latestModelRef.current = vehicleModel;

  // Sync external color updates (e.g. when selecting another user in AdminPanel)
  useEffect(() => {
    const matched = matchStandardColorOption(vehicleColor);
    setColorOption(matched.selectedOption);
    setCustomColorInput(matched.customColor);
  }, [vehicleColor]);

  // Sync Bike selection when vehicleType is Bike or external model changes
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

  // Reset selections cleanly when switching between Moto / Carro / Bike
  useEffect(() => {
    if (lastVehicleTypeRef.current !== vehicleType) {
      const prevGroup = getFipeGroupForVehicleType(lastVehicleTypeRef.current);
      const nextGroup = getFipeGroupForVehicleType(vehicleType);
      lastVehicleTypeRef.current = vehicleType;

      if (prevGroup !== nextGroup) {
        setSelectedBrandCode('');
        setModels([]);
        setSelectedModelName('');
        setCustomManualModel('');
      }
    }
  }, [vehicleType]);

  // Load FIPE brands for Moto or Carros
  useEffect(() => {
    if (!fipeGroup) {
      setBrands([]);
      setIsLoadingBrands(false);
      setFipeBrandsError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingBrands(true);
    setFipeBrandsError(null);

    fetchFipeBrands(fipeGroup)
      .then((list) => {
        if (cancelled) return;
        setBrands(list);

        // Try to match an existing saved vehicleModel (e.g. "Honda CG 160 Titan") to a FIPE brand
        const existing = latestModelRef.current.trim();
        if (existing) {
          const matchedBrand = list.find((b) => {
            const rawLower = b.nome.trim().toLowerCase();
            const fmtLower = formatFipeBrandLabel(b.nome).toLowerCase();
            const exLower = existing.toLowerCase();
            return (
              exLower === rawLower ||
              exLower === fmtLower ||
              exLower.startsWith(`${rawLower} `) ||
              exLower.startsWith(`${fmtLower} `)
            );
          });
          if (matchedBrand) {
            setSelectedBrandCode(matchedBrand.codigo);
          } else {
            setSelectedBrandCode(CUSTOM_MODEL_OPTION_VALUE);
            setCustomManualModel(existing);
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBrands([]);
        setFipeBrandsError(
          'Tabela FIPE temporariamente indisponível. Use "Outro modelo (digitar)".'
        );
        if (latestModelRef.current.trim()) {
          setSelectedBrandCode(CUSTOM_MODEL_OPTION_VALUE);
          setCustomManualModel(latestModelRef.current.trim());
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBrands(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fipeGroup]);

  // Load FIPE models whenever selectedBrandCode changes
  useEffect(() => {
    if (
      !fipeGroup ||
      !selectedBrandCode ||
      selectedBrandCode === CUSTOM_MODEL_OPTION_VALUE
    ) {
      setModels([]);
      setIsLoadingModels(false);
      setFipeModelsError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingModels(true);
    setFipeModelsError(null);

    fetchFipeModels(fipeGroup, selectedBrandCode)
      .then((list) => {
        if (cancelled) return;
        setModels(list);

        const existing = latestModelRef.current.trim();
        const brandObj = brands.find((b) => b.codigo === selectedBrandCode);
        if (existing && brandObj) {
          const exactModel = list.find(
            (m) =>
              combineFipeBrandAndModel(brandObj.nome, m.nome).toLowerCase() ===
                existing.toLowerCase() ||
              m.nome.trim().toLowerCase() === existing.toLowerCase()
          );
          if (exactModel) {
            setSelectedModelName(exactModel.nome);
          } else {
            // Check if existing starts with brand name -> prefill manual remainder or full string
            const rawPrefix = `${brandObj.nome.trim()} `;
            const fmtPrefix = `${formatFipeBrandLabel(brandObj.nome)} `;
            let stripped = existing;
            if (existing.toLowerCase().startsWith(fmtPrefix.toLowerCase())) {
              stripped = existing.slice(fmtPrefix.length).trim();
            } else if (
              existing.toLowerCase().startsWith(rawPrefix.toLowerCase())
            ) {
              stripped = existing.slice(rawPrefix.length).trim();
            }
            // If stripped matches any FIPE model by prefix/equality, pick it; else fallback to manual
            const closeMatch = list.find(
              (m) => m.nome.trim().toLowerCase() === stripped.toLowerCase()
            );
            if (closeMatch) {
              setSelectedModelName(closeMatch.nome);
            } else if (stripped && stripped.toLowerCase() !== brandObj.nome.trim().toLowerCase()) {
              setSelectedModelName(CUSTOM_MODEL_OPTION_VALUE);
              setCustomManualModel(existing);
            }
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setFipeModelsError(
          'Não foi possível carregar os modelos FIPE. Selecione "Outro modelo (digitar)".'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fipeGroup, selectedBrandCode, brands]);

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
    // Clear model until user chooses one from the brand's model dropdown
    onChangeVehicleModel('');
  };

  const handleModelSelectChange = (nextModel: string) => {
    setSelectedModelName(nextModel);
    if (nextModel === CUSTOM_MODEL_OPTION_VALUE) {
      const brandObj = brands.find((b) => b.codigo === selectedBrandCode);
      const prefill =
        customManualModel.trim() ||
        (brandObj ? `${formatFipeBrandLabel(brandObj.nome)} ` : '');
      setCustomManualModel(prefill);
      onChangeVehicleModel(prefill.trim());
      return;
    }
    if (!nextModel) {
      onChangeVehicleModel('');
      return;
    }
    const brandObj = brands.find((b) => b.codigo === selectedBrandCode);
    const combined = brandObj
      ? combineFipeBrandAndModel(brandObj.nome, nextModel)
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
                Outro modelo (digitar)
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
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {/* FIPE Marca */}
            <div>
              <label
                htmlFor={`${idPrefix}-fipe-brand`}
                className="flex items-center justify-between text-[11px] font-semibold text-zinc-700 mb-1"
              >
                <span>
                  Marca (FIPE){' '}
                  {required && <span className="text-red-600">*</span>}
                </span>
                {isLoadingBrands && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                    <Loader2
                      className="h-3 w-3 animate-spin"
                      aria-hidden="true"
                    />
                    <span>Carregando...</span>
                  </span>
                )}
              </label>
              <select
                id={`${idPrefix}-fipe-brand`}
                value={selectedBrandCode}
                onChange={(e) => handleBrandSelectChange(e.target.value)}
                disabled={isLoadingBrands && brands.length === 0}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none disabled:bg-zinc-100"
              >
                <option value="">
                  {isLoadingBrands
                    ? 'Buscando marcas FIPE...'
                    : 'Selecione a marca...'}
                </option>
                {brands.map((b) => (
                  <option key={b.codigo} value={b.codigo}>
                    {formatFipeBrandLabel(b.nome)}
                  </option>
                ))}
                <option value={CUSTOM_MODEL_OPTION_VALUE}>
                  Outro modelo (digitar)
                </option>
              </select>
            </div>

            {/* FIPE Modelo (or hidden/placeholder when Outro modelo is chosen in Brand) */}
            {!isCustomBrand && (
              <div>
                <label
                  htmlFor={`${idPrefix}-fipe-model`}
                  className="flex items-center justify-between text-[11px] font-semibold text-zinc-700 mb-1"
                >
                  <span>
                    Modelo Oficial (FIPE){' '}
                    {required && <span className="text-red-600">*</span>}
                  </span>
                  {isLoadingModels && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                      <Loader2
                        className="h-3 w-3 animate-spin"
                        aria-hidden="true"
                      />
                      <span>Carregando...</span>
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
                      ? 'Escolha a marca primeiro'
                      : isLoadingModels
                      ? 'Buscando modelos FIPE...'
                      : 'Selecione o modelo...'}
                  </option>
                  {models.map((m) => (
                    <option key={`${m.codigo}-${m.nome}`} value={m.nome}>
                      {m.nome}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_OPTION_VALUE}>
                    Outro modelo (digitar)
                  </option>
                </select>
              </div>
            )}
          </div>

          {(fipeBrandsError || fipeModelsError) && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              {fipeModelsError || fipeBrandsError}
            </p>
          )}

          {/* Fallback manual input when user selects "Outro modelo (digitar)" */}
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

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {/* Cor Padronizada */}
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

            {/* Placa do Veículo (ocultada quando Bike) */}
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
