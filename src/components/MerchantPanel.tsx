import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  BellRing,
  Bike,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  MapPin,
  Package,
  PackageCheck,
  Plus,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import {
  resolvePortoAlegreCoordinates,
  SAMPLE_POA_CONSOLIDATED_STOPS,
} from '../constants/portoAlegre';
import {
  calculateUrbanDistanceKm,
  formatFullAddressLine,
  parseFullAddressLine,
  StructuredAddressValue,
} from '../utils/addressLookup';
import { AddressAutocompleteFields } from './AddressAutocompleteFields';
import { CourierAvatar, VehiclePlateBadge } from './CourierAvatar';
import {
  CargoSize,
  DeliveryStop,
  Order,
  OrderFlowDirection,
  OrderStatus,
  OrderType,
  PickupSchedule,
  PickupScheduleMode,
  PixPaymentMethod,
  Profile,
  Rating,
  VehicleType,
} from '../types';
import { formatVehicleModelAndColor } from '../utils/courierIdentity';
import { formatPaymentMethodLabel } from '../utils/pix';
import {
  calculatePricing,
  formatBRL,
  formatDateTimeBR,
  formatVehicleModalDisplayName,
  getCompatibleVehiclesForOrderType,
  getDefaultVehicleForOrderType,
  getVehicleModalPricing,
  hasCleanMobilityDiscount,
  PRICING_RULES,
  PROGRESSIVE_PLATFORM_FEE_NOTE,
  VEHICLE_MODAL_PRICING,
} from '../utils/pricing';
import {
  formatPickupCode,
  normalizeCodeSearchQuery,
} from '../utils/pickupCode';
import { QUICK_NOTICE_META } from '../utils/quickNotice';
import {
  formatPickupScheduleLabel,
  getTodayDateInputValue,
  getTomorrowDateInputValue,
} from '../utils/schedule';
import {
  EvBadge,
  FreightBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PropulsionTag,
} from './EvBadge';
import { MapStopPoint, PortoAlegreMap } from './PortoAlegreMap';
import { PixQrCodeSettlement } from './PixQrCodeSettlement';
import { OrderRatingBox, RatingBadge } from './RatingWidgets';

interface MerchantPanelProps {
  lockedMerchant?: Profile;
  currentEvaluatorId?: string;
  initialFlowDirection?: OrderFlowDirection;
  orders: Order[];
  merchants: Profile[];
  onlineCouriers: Profile[];
  ratings: Rating[];
  activeMerchantId: string;
  platformPixKey: string | null;
  onSelectMerchant: (id: string) => void;
  onCreateOrder: (
    newOrder: Order
  ) => Promise<{ order: Order | null; errorMessage?: string }>;
  onConfirmPixPayment: (orderId: string) => Promise<void>;
  onSubmitRating: (params: {
    deliveryId: string;
    fromProfileId: string;
    toProfileId: string;
    stars: number;
    comment?: string;
  }) => Promise<void>;
  formRef?: React.RefObject<HTMLFormElement | null>;
}

interface RouteStopDraft {
  id: string;
  addressData: StructuredAddressValue;
  expectedRecipient: string;
  recipientNote: string;
}

function createEmptyStopDraft(neighborhood = 'Cidade Baixa'): RouteStopDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    addressData: {
      cep: '',
      street: '',
      number: '',
      complement: '',
      neighborhood,
      cityUf: 'Porto Alegre / RS',
    },
    expectedRecipient: '',
    recipientNote: '',
  };
}

export function MerchantPanel({
  lockedMerchant,
  currentEvaluatorId,
  initialFlowDirection = 'enviar',
  orders,
  merchants,
  onlineCouriers,
  ratings,
  activeMerchantId,
  platformPixKey,
  onSelectMerchant,
  onCreateOrder,
  onConfirmPixPayment,
  onSubmitRating,
  formRef,
}: MerchantPanelProps) {
  const activeMerchant = useMemo(
    () =>
      lockedMerchant ||
      merchants.find((m) => m.id === activeMerchantId) ||
      merchants[0],
    [lockedMerchant, merchants, activeMerchantId]
  );

  const evaluatorId = currentEvaluatorId || activeMerchant?.id || '';

  const [flowDirection, setFlowDirection] = useState<OrderFlowDirection>(
    initialFlowDirection
  );
  const [orderType, setOrderType] = useState<OrderType>('rapida');
  const [requestedVehicle, setRequestedVehicle] = useState<VehicleType>('Moto');
  const [paymentMethod, setPaymentMethod] =
    useState<PixPaymentMethod>('pix_direto');

  const buildUserAddress = (merchant?: Profile): StructuredAddressValue =>
    parseFullAddressLine(
      merchant?.address || 'Rua dos Andradas, 1234',
      merchant?.neighborhood || 'Centro Histórico'
    );

  const buildDefaultThirdPartyAddress = (): StructuredAddressValue =>
    parseFullAddressLine('Av. Getúlio Vargas, 890', 'Menino Deus');

  const [pickupAddr, setPickupAddr] = useState<StructuredAddressValue>(() =>
    initialFlowDirection === 'receber'
      ? buildDefaultThirdPartyAddress()
      : buildUserAddress(activeMerchant)
  );

  // Entrega Rápida & Pequeno Frete shared destination fields
  const [destAddr, setDestAddr] = useState<StructuredAddressValue>(() =>
    initialFlowDirection === 'receber'
      ? buildUserAddress(activeMerchant)
      : buildDefaultThirdPartyAddress()
  );

  const thirdPartyRecipientRef = useRef<{ name: string; note: string }>({
    name: 'Marcos Teixeira',
    note: 'Interfone 42 · Entregar na portaria',
  });

  const buildSelfRecipientName = (merchant?: Profile) =>
    merchant?.businessName || merchant?.name || 'Você (Destinatário)';

  const buildSelfRecipientNote = (merchant?: Profile) =>
    merchant?.phone
      ? `Destinatário cadastrado · Tel: ${merchant.phone}`
      : 'Entregar ao solicitante cadastrado';

  const [singleRecipientName, setSingleRecipientName] = useState<string>(() =>
    initialFlowDirection === 'receber'
      ? buildSelfRecipientName(activeMerchant)
      : 'Marcos Teixeira'
  );
  const [recipientNote, setRecipientNote] = useState<string>(() =>
    initialFlowDirection === 'receber'
      ? buildSelfRecipientNote(activeMerchant)
      : 'Interfone 42 · Entregar na portaria'
  );
  const [distanceKm, setDistanceKm] = useState<number>(4.5);
  const [distanceAutoCalculated, setDistanceAutoCalculated] =
    useState<boolean>(false);

  // Agendamento e Prazo Limite de Retirada (Rotas Consolidadas & PJ)
  const [scheduleMode, setScheduleMode] =
    useState<PickupScheduleMode>('imediata');
  const [readyDate, setReadyDate] = useState<string>(() =>
    getTomorrowDateInputValue()
  );
  const [readyTime, setReadyTime] = useState<string>('09:00');
  const [deadlineDate, setDeadlineDate] = useState<string>(() =>
    getTomorrowDateInputValue()
  );
  const [deadlineTime, setDeadlineTime] = useState<string>('14:00');
  const [useImmediateDeadline, setUseImmediateDeadline] =
    useState<boolean>(false);
  const [immediateDeadlineTime, setImmediateDeadlineTime] =
    useState<string>('17:30');

  // Pequeno Frete specific fields
  const [cargoDescription, setCargoDescription] = useState<string>(
    'Geladeira duplex, sofá 2 lugares e 4 caixas'
  );
  const [cargoSize, setCargoSize] = useState<CargoSize>('grande');
  const [includeHelper, setIncludeHelper] = useState<boolean>(true);
  const [accessNote, setAccessNote] = useState<string>('Elevador de serviço');

  // Rota Consolidada individual stops
  const [routeStops, setRouteStops] = useState<RouteStopDraft[]>([
    {
      id: 'draft-init-1',
      addressData: parseFullAddressLine(
        'Rua João Alfredo, 418 - Apto 204',
        'Cidade Baixa'
      ),
      expectedRecipient: 'Carla Menezes',
      recipientNote: 'Interfone 24',
    },
    {
      id: 'draft-init-2',
      addressData: parseFullAddressLine(
        'Rua General Lima e Silva, 742',
        'Cidade Baixa'
      ),
      expectedRecipient: 'Café República',
      recipientNote: 'Entregar no balcão',
    },
  ]);

  const [customMerchantName, setCustomMerchantName] = useState<string>(
    'Café & Livraria do Centro'
  );
  const [statusFilter, setStatusFilter] = useState<'Todos' | OrderStatus>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(
    orders[0]?.id ?? null
  );
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [confirmingPayOrderId, setConfirmingPayOrderId] = useState<string | null>(
    null
  );
  const [openPixQrOrderIds, setOpenPixQrOrderIds] = useState<
    Record<string, boolean>
  >({});
  const [photoModal, setPhotoModal] = useState<{
    src: string;
    caption: string;
  } | null>(null);

  const handleCopyPixKey = async (orderId: string, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedOrderId(orderId);
      window.setTimeout(() => setCopiedOrderId(null), 2500);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  const handleConfirmPixClick = async (orderId: string) => {
    setConfirmingPayOrderId(orderId);
    try {
      await onConfirmPixPayment(orderId);
    } finally {
      setConfirmingPayOrderId(null);
    }
  };

  const effectivePackageCount = orderType === 'rota' ? routeStops.length : 1;

  const compatibleVehicles = useMemo(
    () => getCompatibleVehiclesForOrderType(orderType),
    [orderType]
  );

  const selectedModalRule = useMemo(
    () => getVehicleModalPricing(requestedVehicle),
    [requestedVehicle]
  );

  const pricing = useMemo(
    () =>
      calculatePricing(
        orderType,
        distanceKm,
        effectivePackageCount,
        {
          cargoSize,
          includeHelper,
        },
        requestedVehicle
      ),
    [
      orderType,
      distanceKm,
      effectivePackageCount,
      cargoSize,
      includeHelper,
      requestedVehicle,
    ]
  );

  const recalculateDistanceFromEndpoints = (
    nextPickup: StructuredAddressValue,
    nextDest: StructuredAddressValue
  ) => {
    const pickupLine = formatFullAddressLine(nextPickup);
    const pickupNb = nextPickup.neighborhood.trim() || 'Centro Histórico';
    const destLine = formatFullAddressLine(nextDest);
    const destNb = nextDest.neighborhood.trim() || 'Menino Deus';

    const pCoords =
      nextPickup.lat !== undefined && nextPickup.lng !== undefined
        ? { lat: nextPickup.lat, lng: nextPickup.lng }
        : resolvePortoAlegreCoordinates(pickupLine, pickupNb, 0);

    const dCoords =
      nextDest.lat !== undefined && nextDest.lng !== undefined
        ? { lat: nextDest.lat, lng: nextDest.lng }
        : resolvePortoAlegreCoordinates(destLine, destNb, 1);

    const km = calculateUrbanDistanceKm(
      pCoords.lat,
      pCoords.lng,
      dCoords.lat,
      dCoords.lng
    );
    setDistanceKm(km);
    setDistanceAutoCalculated(true);
  };

  const handlePickupChange = (
    next: StructuredAddressValue,
    meta?: { fromLookup?: boolean }
  ) => {
    setPickupAddr(next);
    if (meta?.fromLookup) {
      recalculateDistanceFromEndpoints(next, destAddr);
    }
  };

  const handleDestChange = (
    next: StructuredAddressValue,
    meta?: { fromLookup?: boolean }
  ) => {
    setDestAddr(next);
    if (meta?.fromLookup) {
      recalculateDistanceFromEndpoints(pickupAddr, next);
    }
  };

  const applyFlowDirectionSwitch = (
    nextDir: OrderFlowDirection,
    scrollToForm = false
  ) => {
    setFormError('');
    if (nextDir !== flowDirection) {
      if (nextDir === 'receber') {
        thirdPartyRecipientRef.current = {
          name: singleRecipientName,
          note: recipientNote,
        };
        const currentPickup = pickupAddr;
        const currentDest = destAddr;
        setPickupAddr(currentDest);
        setDestAddr(
          currentPickup.street.trim()
            ? currentPickup
            : buildUserAddress(activeMerchant)
        );
        setSingleRecipientName(buildSelfRecipientName(activeMerchant));
        setRecipientNote(buildSelfRecipientNote(activeMerchant));
        if (orderType === 'rota') {
          setOrderType('rapida');
        }
      } else {
        const currentPickup = pickupAddr;
        const currentDest = destAddr;
        setPickupAddr(
          currentDest.street.trim()
            ? currentDest
            : buildUserAddress(activeMerchant)
        );
        setDestAddr(currentPickup);
        setSingleRecipientName(thirdPartyRecipientRef.current.name);
        setRecipientNote(thirdPartyRecipientRef.current.note);
      }
      setFlowDirection(nextDir);
    }

    if (scrollToForm && formRef?.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    if (initialFlowDirection !== flowDirection) {
      applyFlowDirectionSwitch(initialFlowDirection, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFlowDirection]);

  const handleOrderTypeChange = (nextType: OrderType) => {
    setOrderType(nextType);
    setFormError('');
    const allowed = getCompatibleVehiclesForOrderType(nextType);
    if (!allowed.includes(requestedVehicle)) {
      setRequestedVehicle(getDefaultVehicleForOrderType(nextType));
    }
    if (nextType === 'frete' && !distanceAutoCalculated && distanceKm < 5) {
      setDistanceKm(6);
    }
  };

  const handleMerchantChange = (id: string) => {
    onSelectMerchant(id);
    const chosen = merchants.find((m) => m.id === id);
    if (chosen) {
      const nextOwn = buildUserAddress(chosen);
      if (flowDirection === 'receber') {
        setDestAddr(nextOwn);
        setSingleRecipientName(buildSelfRecipientName(chosen));
        setRecipientNote(buildSelfRecipientNote(chosen));
      } else {
        setPickupAddr(nextOwn);
      }
    }
  };

  const handleAddStopDraft = () => {
    const lastNeighborhood =
      routeStops[routeStops.length - 1]?.addressData.neighborhood ||
      'Cidade Baixa';
    setRouteStops((prev) => [...prev, createEmptyStopDraft(lastNeighborhood)]);
  };

  const handleRemoveStopDraft = (id: string) => {
    if (routeStops.length <= 2) return;
    setRouteStops((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateStopAddress = (
    id: string,
    addressData: StructuredAddressValue
  ) => {
    setRouteStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, addressData } : s))
    );
  };

  const handleUpdateStopText = (
    id: string,
    field: 'expectedRecipient' | 'recipientNote',
    value: string
  ) => {
    setRouteStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleFillSamplePoaStops = () => {
    setFormError('');
    setRouteStops(
      SAMPLE_POA_CONSOLIDATED_STOPS.map((sample, idx) => ({
        id: `sample-${Date.now()}-${idx}`,
        addressData: parseFullAddressLine(sample.address, sample.neighborhood),
        expectedRecipient: sample.expectedRecipient,
        recipientNote: sample.recipientNote,
      }))
    );
  };

  const pickupAddressFormatted = useMemo(
    () => formatFullAddressLine(pickupAddr),
    [pickupAddr]
  );
  const pickupNeighborhoodValue =
    pickupAddr.neighborhood.trim() || 'Centro Histórico';

  const singleDestinationFormatted = useMemo(
    () => formatFullAddressLine(destAddr),
    [destAddr]
  );
  const destNeighborhoodValue = destAddr.neighborhood.trim() || 'Menino Deus';

  // Live map preview points based on current form state
  const previewPickup = useMemo(() => {
    const coords =
      pickupAddr.lat !== undefined && pickupAddr.lng !== undefined
        ? { lat: pickupAddr.lat, lng: pickupAddr.lng }
        : resolvePortoAlegreCoordinates(
            pickupAddressFormatted,
            pickupNeighborhoodValue,
            0
          );
    return {
      label: activeMerchant?.businessName || activeMerchant?.name || 'Coleta',
      address: pickupAddressFormatted || 'Endereço de coleta',
      neighborhood: pickupNeighborhoodValue,
      lat: coords.lat,
      lng: coords.lng,
    };
  }, [pickupAddr, pickupAddressFormatted, pickupNeighborhoodValue, activeMerchant]);

  const previewStops: MapStopPoint[] = useMemo(() => {
    if (orderType === 'rapida' || orderType === 'frete') {
      const coords =
        destAddr.lat !== undefined && destAddr.lng !== undefined
          ? { lat: destAddr.lat, lng: destAddr.lng }
          : resolvePortoAlegreCoordinates(
              singleDestinationFormatted,
              destNeighborhoodValue,
              1
            );
      return [
        {
          id: 'preview-single',
          sequence: 1,
          address: singleDestinationFormatted || 'Endereço de entrega',
          neighborhood: destNeighborhoodValue,
          expectedRecipient: singleRecipientName || undefined,
          recipientNote:
            orderType === 'frete'
              ? `${cargoDescription}${accessNote ? ` · Acesso: ${accessNote}` : ''}`
              : recipientNote || undefined,
          lat: coords.lat,
          lng: coords.lng,
          delivered: false,
        },
      ];
    }

    return routeStops.map((stop, idx) => {
      const formatted = formatFullAddressLine(stop.addressData);
      const nb = stop.addressData.neighborhood.trim() || 'Cidade Baixa';
      const coords =
        stop.addressData.lat !== undefined && stop.addressData.lng !== undefined
          ? { lat: stop.addressData.lat, lng: stop.addressData.lng }
          : resolvePortoAlegreCoordinates(formatted, nb, idx + 1);
      return {
        id: stop.id,
        sequence: idx + 1,
        address: formatted || `Parada #${idx + 1}`,
        neighborhood: nb,
        expectedRecipient: stop.expectedRecipient || undefined,
        recipientNote: stop.recipientNote || undefined,
        lat: coords.lat,
        lng: coords.lng,
        delivered: false,
      };
    });
  }, [
    orderType,
    destAddr,
    singleDestinationFormatted,
    destNeighborhoodValue,
    singleRecipientName,
    recipientNote,
    cargoDescription,
    accessNote,
    routeStops,
  ]);

  const showSchedulingSection =
    orderType === 'rota' || activeMerchant?.personType !== 'PF';

  const schedulePreviewLabel = useMemo(() => {
    if (!showSchedulingSection) return null;
    if (scheduleMode === 'agendada') {
      return formatPickupScheduleLabel({
        mode: 'agendada',
        readyAt: `${readyDate}T${readyTime}`,
        deadlineAt: `${deadlineDate}T${deadlineTime}`,
      });
    }
    if (useImmediateDeadline && immediateDeadlineTime) {
      return formatPickupScheduleLabel({
        mode: 'imediata',
        deadlineAt: `${getTodayDateInputValue()}T${immediateDeadlineTime}`,
      });
    }
    return 'Retirada imediata (Hoje) · Disponível agora';
  }, [
    showSchedulingSection,
    scheduleMode,
    readyDate,
    readyTime,
    deadlineDate,
    deadlineTime,
    useImmediateDeadline,
    immediateDeadlineTime,
  ]);

  const handleApplyTomorrowMorningPreset = () => {
    const tomorrow = getTomorrowDateInputValue();
    setScheduleMode('agendada');
    setReadyDate(tomorrow);
    setReadyTime('09:00');
    setDeadlineDate(tomorrow);
    setDeadlineTime('14:00');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!pickupAddr.street.trim()) {
      setFormError('Informe a rua e endereço de coleta em Porto Alegre.');
      return;
    }

    let pickupSchedule: PickupSchedule | undefined;
    if (showSchedulingSection) {
      if (scheduleMode === 'agendada') {
        if (!readyDate || !readyTime || !deadlineDate || !deadlineTime) {
          setFormError(
            'Informe a data/horário de liberação e o prazo limite para retirada.'
          );
          return;
        }
        const readyMs = new Date(`${readyDate}T${readyTime}`).getTime();
        const deadlineMs = new Date(`${deadlineDate}T${deadlineTime}`).getTime();
        if (Number.isNaN(readyMs) || Number.isNaN(deadlineMs) || deadlineMs <= readyMs) {
          setFormError(
            'O prazo limite para retirada deve ser posterior à data e horário de liberação.'
          );
          return;
        }
        pickupSchedule = {
          mode: 'agendada',
          readyAt: `${readyDate}T${readyTime}`,
          deadlineAt: `${deadlineDate}T${deadlineTime}`,
        };
      } else if (useImmediateDeadline && immediateDeadlineTime) {
        pickupSchedule = {
          mode: 'imediata',
          deadlineAt: `${getTodayDateInputValue()}T${immediateDeadlineTime}`,
        };
      } else {
        pickupSchedule = { mode: 'imediata' };
      }
    }

    let stops: DeliveryStop[] = [];
    let resolvedDestNeighborhood = destNeighborhoodValue;

    if (orderType === 'rapida' || orderType === 'frete') {
      if (!destAddr.street.trim()) {
        setFormError('Informe a rua e endereço completo de entrega.');
        return;
      }
      if (orderType === 'frete' && !cargoDescription.trim()) {
        setFormError('Descreva a carga para o Pequeno Frete.');
        return;
      }

      const coords =
        destAddr.lat !== undefined && destAddr.lng !== undefined
          ? { lat: destAddr.lat, lng: destAddr.lng }
          : resolvePortoAlegreCoordinates(
              singleDestinationFormatted,
              destNeighborhoodValue,
              1
            );
      const stopId = crypto.randomUUID();
      stops = [
        {
          id: stopId,
          pickupCode: formatPickupCode(stopId),
          sequence: 1,
          address: singleDestinationFormatted,
          neighborhood: destNeighborhoodValue,
          expectedRecipient: singleRecipientName.trim() || undefined,
          recipientNote:
            orderType === 'frete'
              ? [cargoDescription.trim(), accessNote.trim()]
                  .filter(Boolean)
                  .join(' · ')
              : recipientNote.trim() || undefined,
          lat: coords.lat,
          lng: coords.lng,
          delivered: false,
        },
      ];
    } else {
      const incompleteStop = routeStops.find(
        (s) => !s.addressData.street.trim()
      );
      if (incompleteStop) {
        setFormError(
          'Preencha a rua e endereço de todas as paradas da Rota Consolidada (ou use "Preencher Paradas de Exemplo em POA").'
        );
        return;
      }

      stops = routeStops.map((draft, idx) => {
        const formatted = formatFullAddressLine(draft.addressData);
        const nb = draft.addressData.neighborhood.trim() || 'Cidade Baixa';
        const coords =
          draft.addressData.lat !== undefined &&
          draft.addressData.lng !== undefined
            ? { lat: draft.addressData.lat, lng: draft.addressData.lng }
            : resolvePortoAlegreCoordinates(formatted, nb, idx + 1);
        const stopId = crypto.randomUUID();
        return {
          id: stopId,
          pickupCode: formatPickupCode(stopId),
          sequence: idx + 1,
          address: formatted,
          neighborhood: nb,
          expectedRecipient: draft.expectedRecipient.trim() || undefined,
          recipientNote: draft.recipientNote.trim() || undefined,
          lat: coords.lat,
          lng: coords.lng,
          delivered: false,
        };
      });

      const uniqueNeighborhoods = Array.from(
        new Set(stops.map((s) => s.neighborhood))
      );
      resolvedDestNeighborhood =
        uniqueNeighborhoods.length === 1
          ? uniqueNeighborhoods[0]
          : `${uniqueNeighborhoods[0]} +${uniqueNeighborhoods.length - 1} bairros`;
    }

    const pickupCoords =
      pickupAddr.lat !== undefined && pickupAddr.lng !== undefined
        ? { lat: pickupAddr.lat, lng: pickupAddr.lng }
        : resolvePortoAlegreCoordinates(
            pickupAddressFormatted,
            pickupNeighborhoodValue,
            0
          );

    const newOrderId = crypto.randomUUID();
    const newOrder: Order = {
      id: newOrderId,
      code: formatPickupCode(newOrderId),
      type: orderType,
      requestedVehicle,
      flowDirection,
      pickupSchedule,
      merchantId: activeMerchant?.id || '',
      merchantName:
        activeMerchant?.businessName ||
        activeMerchant?.name ||
        customMerchantName.trim() ||
        'Lojista Porto Alegre',
      pickupAddress: pickupAddressFormatted,
      pickupNeighborhood: pickupNeighborhoodValue,
      pickupLat: pickupCoords.lat,
      pickupLng: pickupCoords.lng,
      destinationNeighborhood: resolvedDestNeighborhood,
      distanceKm: orderType === 'rota' ? undefined : distanceKm,
      packageCount: stops.length,
      freightDetails:
        orderType === 'frete'
          ? {
              cargoDescription: cargoDescription.trim(),
              cargoSize,
              includeHelper,
              accessNote: accessNote.trim() || 'Térreo',
            }
          : undefined,
      stops,
      grossTotal: pricing.grossTotal,
      standardPlatformFee: pricing.standardPlatformFee,
      basePayout: pricing.basePayout,
      status: 'Aguardando',
      paymentMethod,
      paymentStatus: 'pendente_pagamento',
      createdAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      const result = await onCreateOrder(newOrder);
      if (result.order) {
        setExpandedOrderId(result.order.id);
      } else {
        setFormError(
          result.errorMessage || 'Não foi possível salvar o pedido no Supabase.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== 'Todos' && order.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const normalizedCodeQuery = normalizeCodeSearchQuery(searchQuery);
        return (
          order.code.toLowerCase().includes(q) ||
          normalizeCodeSearchQuery(order.code).includes(normalizedCodeQuery) ||
          order.stops.some((s) => {
            const code = s.pickupCode || formatPickupCode(s.id);
            return (
              code.toLowerCase().includes(q) ||
              normalizeCodeSearchQuery(code).includes(normalizedCodeQuery)
            );
          }) ||
          order.merchantName.toLowerCase().includes(q) ||
          order.pickupNeighborhood.toLowerCase().includes(q) ||
          order.destinationNeighborhood.toLowerCase().includes(q) ||
          (order.freightDetails?.cargoDescription.toLowerCase().includes(q) ??
            false)
        );
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      total: orders.length,
      aguardando: orders.filter((o) => o.status === 'Aguardando').length,
      emRota: orders.filter((o) => o.status === 'Em Rota').length,
      entregue: orders.filter((o) => o.status === 'Entregue').length,
    };
  }, [orders]);

  return (
    <div className="space-y-8">
      {/* Intro / Business Rules Summary Strip */}
      <section className="flex flex-col gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-1.5">
          <p className="text-xs font-medium text-emerald-700">
            Porto Alegre · RS · Logística Urbana com Taxa Fixa
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Painel do Lojista
          </h1>
          <p className="text-sm leading-relaxed text-zinc-600">
            Solicite entregas rápidas, rotas consolidadas ou{' '}
            <strong className="font-semibold text-zinc-900">
              pequenos fretes de utilitário
            </strong>{' '}
            com repasse transparente e 50% de desconto na taxa para bicicletas e
            veículos elétricos.
          </p>
          <div className="pt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                onlineCouriers.length > 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-zinc-200 bg-zinc-100 text-zinc-600'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  onlineCouriers.length > 0
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-zinc-400'
                }`}
                aria-hidden="true"
              />
              <span>
                {onlineCouriers.length > 0
                  ? `${onlineCouriers.length} entregador(es) ONLINE agora em Porto Alegre`
                  : 'Nenhum entregador online no momento em Porto Alegre'}
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border border-zinc-200 bg-white px-4 py-3 rounded-xl shrink-0">
          <div>
            <p className="text-xs text-zinc-500">Aguardando</p>
            <p className="font-mono text-lg font-semibold text-zinc-900 tabular-nums">
              {counts.aguardando}
            </p>
          </div>
          <div className="border-l border-zinc-200 pl-4">
            <p className="text-xs text-zinc-500">Em Rota</p>
            <p className="font-mono text-lg font-semibold text-zinc-900 tabular-nums">
              {counts.emRota}
            </p>
          </div>
          <div className="border-l border-zinc-200 pl-4">
            <p className="text-xs text-zinc-500">Entregues</p>
            <p className="font-mono text-lg font-semibold text-emerald-700 tabular-nums">
              {counts.entregue}
            </p>
          </div>
        </div>
      </section>

      {/* Atalhos Intuitivos: Quero enviar um item vs Quero receber um item */}
      <section aria-label="Ações rápidas do solicitante" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => applyFlowDirectionSwitch('enviar', true)}
          className={`flex items-start gap-3.5 rounded-2xl border-2 p-4 text-left transition-all ${
            flowDirection === 'enviar'
              ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
              : 'border-zinc-200 bg-white hover:border-emerald-300 hover:bg-zinc-50'
          }`}
        >
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${
              flowDirection === 'enviar'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm sm:text-base font-bold text-zinc-950">
                Quero enviar um item
              </span>
              {flowDirection === 'enviar' && (
                <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  Ativo
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Coleta no seu endereço cadastrado e entrega no destino do cliente ou destinatário.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => applyFlowDirectionSwitch('receber', true)}
          className={`flex items-start gap-3.5 rounded-2xl border-2 p-4 text-left transition-all ${
            flowDirection === 'receber'
              ? 'border-sky-600 bg-sky-50/70 shadow-xs'
              : 'border-zinc-200 bg-white hover:border-sky-300 hover:bg-zinc-50'
          }`}
        >
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${
              flowDirection === 'receber'
                ? 'bg-sky-600 text-white'
                : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            <PackageCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm sm:text-base font-bold text-zinc-950">
                Quero receber um item
              </span>
              {flowDirection === 'receber' && (
                <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  Ativo
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Retirada no endereço de terceiros e entrega no seu endereço (com seus dados já preenchidos).
            </p>
          </div>
        </button>
      </section>

      {/* Form + Live Map Preview & Transparent Pricing Breakdown */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5 scroll-mt-24"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-zinc-900">
                Nova Solicitação em Porto Alegre
              </h2>
              <p className="text-xs text-zinc-500">
                Os pinos no mapa atualizam conforme os bairros e endereços em POA.
              </p>
            </div>

            {lockedMerchant ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-900">
                {lockedMerchant.personType === 'PF' ? 'Solicitante (PF): ' : 'Loja (PJ): '}
                {lockedMerchant.businessName || lockedMerchant.name}
              </div>
            ) : merchants.length > 0 ? (
              <div className="min-w-[200px]">
                <label htmlFor="merchant-select" className="sr-only">
                  Loja remetente
                </label>
                <select
                  id="merchant-select"
                  value={activeMerchant?.id || ''}
                  onChange={(e) => handleMerchantChange(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 focus:border-emerald-600 focus:bg-white focus:outline-none"
                >
                  {merchants.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.businessName || m.name} ({m.neighborhood})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="min-w-[210px]">
                <label htmlFor="custom-merchant-name" className="sr-only">
                  Nome da loja remetente
                </label>
                <input
                  id="custom-merchant-name"
                  type="text"
                  value={customMerchantName}
                  onChange={(e) => setCustomMerchantName(e.target.value)}
                  placeholder="Nome da Loja / Remetente"
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* 3-option Segmented Service Type Switch */}
          <div>
            <span className="block text-xs font-semibold text-zinc-700 mb-2">
              Modalidade de Serviço
            </span>
            <div className="grid grid-cols-1 gap-1.5 rounded-lg bg-zinc-100 p-1 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => handleOrderTypeChange('rapida')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  orderType === 'rapida'
                    ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <MapPin className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>Entrega Rápida</span>
              </button>
              <button
                type="button"
                onClick={() => handleOrderTypeChange('rota')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  orderType === 'rota'
                    ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Package className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>Rota Consolidada</span>
              </button>
              <button
                type="button"
                onClick={() => handleOrderTypeChange('frete')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  orderType === 'frete'
                    ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Truck className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                <span>Pequeno Frete</span>
              </button>
            </div>
            {orderType === 'frete' && (
              <p className="mt-2 text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                <strong>Pequeno Frete (Utilitário / Fiorino):</strong> base
                mínima {formatBRL(VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].baseFare)}{' '}
                (até {VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].baseKm} km) +{' '}
                {formatBRL(VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].perKmRate)}/km adicional.
                Taxa operacional inicial de{' '}
                {formatBRL(VEHICLE_MODAL_PRICING['Utilitário / Picape / Van'].initialPlatformFee)}.
              </p>
            )}
          </div>

          {/* Categoria de Veículo (Precificação Diferenciada por Modal) */}
          <div className="space-y-2">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="block text-xs font-semibold text-zinc-700">
                Categoria de Veículo (Tarifa e Taxa por Modal)
              </span>
              <span className="text-[11px] text-zinc-500">
                Filtra automaticamente apenas entregadores compatíveis
              </span>
            </div>
            <div
              className={`grid grid-cols-1 gap-2 ${
                compatibleVehicles.length === 1
                  ? 'sm:grid-cols-1'
                  : 'sm:grid-cols-3'
              }`}
            >
              {compatibleVehicles.map((vType) => {
                const rule = VEHICLE_MODAL_PRICING[vType];
                const isSelected = requestedVehicle === vType;
                return (
                  <button
                    key={vType}
                    type="button"
                    onClick={() => setRequestedVehicle(vType)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 shadow-2xs'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{rule.label}</span>
                      {isSelected && (
                        <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                          Selecionado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-zinc-600 tabular-nums">
                      {orderType === 'rota'
                        ? `${formatBRL(rule.rotaPerPackage)}/pacote · Taxa ${formatBRL(
                            rule.rotaInitialPlatformFeePerPackage
                          )}/pct`
                        : `Base ${formatBRL(rule.baseFare)} (até ${rule.baseKm} km) + ${formatBRL(
                            rule.perKmRate
                          )}/km`}
                    </p>
                    {orderType !== 'rota' && (
                      <p className="mt-0.5 font-mono text-[11px] text-emerald-800 tabular-nums">
                        Taxa op. inicial: {formatBRL(rule.initialPlatformFee)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visual Flow Direction Context Banner */}
          {flowDirection === 'receber' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-950">
              <div className="flex items-start gap-2">
                <ArrowRightLeft
                  className="h-4 w-4 text-sky-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>
                  <strong>Modo Receber Item:</strong> o entregador retira no
                  endereço de terceiros abaixo e entrega para você no seu
                  endereço cadastrado.
                </span>
              </div>
              <button
                type="button"
                onClick={() => applyFlowDirectionSwitch('enviar', false)}
                className="font-semibold text-sky-800 underline underline-offset-2 hover:text-sky-950 self-start sm:self-center shrink-0"
              >
                Mudar para Enviar
              </button>
            </div>
          )}

          {/* Pickup Details */}
          <div
            className={`rounded-xl border p-4 ${
              flowDirection === 'receber'
                ? 'border-sky-200 bg-sky-50/40'
                : 'border-zinc-200 bg-zinc-50/60'
            }`}
          >
            <AddressAutocompleteFields
              idPrefix="pickup"
              sectionLabel={
                flowDirection === 'receber'
                  ? '1. Endereço de Retirada de Terceiros (Onde buscar)'
                  : orderType === 'frete'
                  ? '1. Origem da Carga / Coleta (Seu Endereço)'
                  : '1. Endereço de Coleta (Seu Endereço)'
              }
              value={pickupAddr}
              onChange={handlePickupChange}
              streetPlaceholder={
                flowDirection === 'receber'
                  ? 'Ex: Rua onde o item será retirado'
                  : 'Ex: Rua dos Andradas'
              }
              complementPlaceholder="Ex: Loja 2 / Fundos / Portaria"
            />
          </div>

          {/* Service-specific fields */}
          {orderType === 'rapida' || orderType === 'frete' ? (
            <div className="space-y-4 border-t border-zinc-100 pt-4">
              <div
                className={`rounded-xl border p-4 ${
                  flowDirection === 'receber'
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-zinc-200 bg-zinc-50/60'
                }`}
              >
                <AddressAutocompleteFields
                  idPrefix="dest"
                  sectionLabel={
                    flowDirection === 'receber'
                      ? '2. Endereço de Entrega para Você (Seu Cadastro)'
                      : orderType === 'frete'
                      ? '2. Destino do Pequeno Frete (CEP ou Busca Inteligente)'
                      : '2. Endereço de Entrega (Destinatário)'
                  }
                  value={destAddr}
                  onChange={handleDestChange}
                  streetPlaceholder="Ex: Av. Getúlio Vargas"
                  complementPlaceholder="Ex: Apto 402 / Bloco B"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="distance-km"
                    className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    <span>Distância Estimada (km)</span>
                    {distanceAutoCalculated && (
                      <span className="text-[10px] font-semibold text-emerald-700">
                        Calculada pelo mapa
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="distance-km"
                      type="number"
                      min={1}
                      max={120}
                      step={0.1}
                      value={distanceKm}
                      onChange={(e) => {
                        setDistanceAutoCalculated(false);
                        setDistanceKm(Math.max(1, Number(e.target.value) || 1));
                      }}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-mono text-sm text-zinc-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                    />
                    <span className="text-xs font-medium text-zinc-500 shrink-0">
                      km
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="single-recipient"
                    className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    <span>
                      {flowDirection === 'receber'
                        ? 'Destinatário (Você)'
                        : 'Nome do Recebedor'}
                    </span>
                    {flowDirection === 'receber' && (
                      <span className="text-[10px] font-semibold text-emerald-700">
                        Preenchido com seus dados
                      </span>
                    )}
                  </label>
                  <input
                    id="single-recipient"
                    type="text"
                    value={singleRecipientName}
                    onChange={(e) => setSingleRecipientName(e.target.value)}
                    placeholder="Ex: Marcos Teixeira"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {orderType === 'rapida' ? (
                <div>
                  <label
                    htmlFor="recipient-note"
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    Observação / Complemento
                  </label>
                  <input
                    id="recipient-note"
                    type="text"
                    value={recipientNote}
                    onChange={(e) => setRecipientNote(e.target.value)}
                    placeholder="Ex: Apto 402 · Entregar na portaria / Frágil"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/30 p-4">
                  <div>
                    <label
                      htmlFor="cargo-description"
                      className="block text-xs font-semibold text-zinc-800 mb-1.5"
                    >
                      Descrição da Carga (Obrigatório)
                    </label>
                    <input
                      id="cargo-description"
                      type="text"
                      value={cargoDescription}
                      onChange={(e) => setCargoDescription(e.target.value)}
                      placeholder="Ex: Geladeira, sofá e 4 caixas"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-zinc-800 mb-1.5">
                      Porte da Carga
                    </span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setCargoSize('medio')}
                        className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                          cargoSize === 'medio'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                            : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <div>Médio (caixas/eletrodoméstico leve)</div>
                        <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                          +R$ 0,00
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCargoSize('grande')}
                        className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                          cargoSize === 'grande'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                            : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <div>Grande/Volumoso (móveis/geladeira)</div>
                        <div className="font-mono text-[11px] text-emerald-700 mt-0.5">
                          +R$ 25,00
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
                    <label className="flex items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeHelper}
                        onChange={(e) => setIncludeHelper(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span className="text-xs text-zinc-800 leading-snug">
                        <strong>Incluir Ajudante de Carga/Descarga</strong>
                        <span className="block font-mono text-[11px] text-emerald-700 mt-0.5">
                          +R$ 40,00
                        </span>
                      </span>
                    </label>

                    <div>
                      <label
                        htmlFor="access-note"
                        className="block text-xs font-semibold text-zinc-800 mb-1.5"
                      >
                        Observação de Acesso
                      </label>
                      <input
                        id="access-note"
                        type="text"
                        value={accessNote}
                        onChange={(e) => setAccessNote(e.target.value)}
                        placeholder="Ex: Térreo, Elevador, 2º andar de escada"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 border-t border-zinc-100 pt-4">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Paradas da Rota Consolidada ({routeStops.length} pacotes)
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Adicione cada entrega com endereço, bairro, recebedor e complemento.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleFillSamplePoaStops}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Preencher Paradas de Exemplo em POA</span>
                </button>
              </div>

              <div className="space-y-3">
                {routeStops.map((stop, idx) => (
                  <div
                    key={stop.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 font-mono text-[11px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <span>Parada #{idx + 1}</span>
                      </span>

                      {routeStops.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStopDraft(stop.id)}
                          aria-label={`Remover parada ${idx + 1}`}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>

                    <AddressAutocompleteFields
                      idPrefix={`stop-${stop.id}`}
                      value={stop.addressData}
                      onChange={(nextAddr) =>
                        handleUpdateStopAddress(stop.id, nextAddr)
                      }
                      compact
                      streetPlaceholder="Ex: Rua João Alfredo"
                      complementPlaceholder="Ex: Apto 204 / Fundos"
                    />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`stop-rec-${stop.id}`}
                          className="block text-[11px] font-medium text-zinc-600 mb-1"
                        >
                          Nome do Recebedor
                        </label>
                        <input
                          id={`stop-rec-${stop.id}`}
                          type="text"
                          value={stop.expectedRecipient}
                          onChange={(e) =>
                            handleUpdateStopText(
                              stop.id,
                              'expectedRecipient',
                              e.target.value
                            )
                          }
                          placeholder="Ex: Carla Menezes"
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`stop-note-${stop.id}`}
                          className="block text-[11px] font-medium text-zinc-600 mb-1"
                        >
                          Observação para Entrega
                        </label>
                        <input
                          id={`stop-note-${stop.id}`}
                          type="text"
                          value={stop.recipientNote}
                          onChange={(e) =>
                            handleUpdateStopText(
                              stop.id,
                              'recipientNote',
                              e.target.value
                            )
                          }
                          placeholder="Ex: Portaria 24h / Frágil"
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddStopDraft}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                <span>Adicionar Parada</span>
              </button>
            </div>
          )}

          {/* Agendamento e Prazo Limite de Retirada (Rotas Consolidadas e Pedidos PJ) */}
          {showSchedulingSection && (
            <div className="border-t border-zinc-100 pt-4 space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                  <CalendarClock
                    className="h-4 w-4 text-emerald-600 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Agendamento e Prazo Limite de Retirada</span>
                </span>
                <button
                  type="button"
                  onClick={handleApplyTomorrowMorningPreset}
                  className="self-start sm:self-auto text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  Atalho: Amanhã (09:00 → 14:00)
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode('imediata')}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    scheduleMode === 'imediata'
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <p className="text-xs font-semibold">
                    Retirada Imediata (Hoje)
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Pacotes já prontos ou liberação imediata para hoje
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleMode('agendada')}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    scheduleMode === 'agendada'
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <p className="text-xs font-semibold">
                    Agendar Retirada (Dia Seguinte / Data Específica)
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Defina quando os pacotes estarão prontos e o prazo máximo
                  </p>
                </button>
              </div>

              {scheduleMode === 'imediata' ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useImmediateDeadline}
                      onChange={(e) => setUseImmediateDeadline(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>Informar horário limite de retirada hoje (ex: fechamento da loja)</span>
                  </label>
                  {useImmediateDeadline && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label
                        htmlFor="immediate-deadline-time"
                        className="text-xs font-medium text-zinc-600"
                      >
                        Até:
                      </label>
                      <input
                        id="immediate-deadline-time"
                        type="time"
                        value={immediateDeadlineTime}
                        onChange={(e) => setImmediateDeadlineTime(e.target.value)}
                        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-zinc-800">
                        Data e Horário de Liberação
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          aria-label="Data de liberação"
                          type="date"
                          value={readyDate}
                          onChange={(e) => setReadyDate(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                        />
                        <input
                          aria-label="Horário de liberação"
                          type="time"
                          value={readyTime}
                          onChange={(e) => setReadyTime(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 font-mono text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-zinc-800">
                        Prazo Limite para Retirada
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          aria-label="Data limite para retirada"
                          type="date"
                          value={deadlineDate}
                          onChange={(e) => setDeadlineDate(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                        />
                        <input
                          aria-label="Horário limite para retirada"
                          type="time"
                          value={deadlineTime}
                          onChange={(e) => setDeadlineTime(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 font-mono text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {schedulePreviewLabel && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
                      <CalendarClock
                        className="h-3.5 w-3.5 text-amber-700 shrink-0"
                        aria-hidden="true"
                      />
                      <span>Prévia no mural: {schedulePreviewLabel}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Forma de Pagamento Pix */}
          <div className="border-t border-zinc-100 pt-4 space-y-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
              <QrCode className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              <span>Forma de Pagamento (Pix)</span>
            </span>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('pix_direto')}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  paymentMethod === 'pix_direto'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <p className="text-xs font-semibold">
                  Pix Direto ao Entregador (Recomendado para Bike/Elétrico · -50% na Taxa)
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Pague via QR Code Pix, Copia e Cola ou Chave Pix direto ao condutor
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('pix_plataforma')}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  paymentMethod === 'pix_plataforma'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <p className="text-xs font-semibold">
                  Pix para Plataforma RotaJusta
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Transferência para a chave oficial RotaJusta com repasse gerido no Admin
                </p>
              </button>
            </div>
          </div>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {formError}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
            <p className="text-xs text-zinc-500">
              O pedido entra imediatamente no Mural do Entregador como{' '}
              <span className="font-medium text-zinc-800">Aguardando</span>.
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>
                {isSubmitting
                  ? 'Publicando no Supabase...'
                  : orderType === 'rapida'
                  ? 'Publicar Entrega Rápida'
                  : orderType === 'frete'
                  ? 'Publicar Pequeno Frete'
                  : 'Publicar Rota de Pacotes'}
              </span>
            </button>
          </div>
        </form>

        {/* Right Column: Live Porto Alegre Map + Transparent Pricing */}
        <aside className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
          <PortoAlegreMap
            pickup={previewPickup}
            stops={previewStops}
            heightClass="h-[290px]"
            title="Prévia da Rota em Porto Alegre"
          />

          <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 pb-4">
              <div>
                <p className="text-xs font-medium text-emerald-700">
                  Transparência Financeira · {selectedModalRule.label}
                </p>
                <h3 className="font-display text-lg font-semibold text-zinc-900">
                  Resumo do Cálculo
                </h3>
              </div>
              <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-800">
                Modal: {selectedModalRule.shortLabel}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              {orderType === 'rapida' && (
                <>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>
                      Tarifa base {selectedModalRule.shortLabel} (até{' '}
                      {pricing.baseKm} km)
                    </span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(pricing.baseComponent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>
                      Adicional ({pricing.extraKm.toLocaleString('pt-BR')} km ×{' '}
                      {formatBRL(pricing.perKmRate)}/km)
                    </span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(pricing.extraDistanceComponent)}
                    </span>
                  </div>
                </>
              )}

              {orderType === 'rota' && (
                <div className="flex items-center justify-between text-zinc-600">
                  <span>
                    {effectivePackageCount} paradas/pacotes ({selectedModalRule.shortLabel}) ×{' '}
                    {formatBRL(pricing.perPackageRate)}
                  </span>
                  <span className="font-mono font-medium text-zinc-900 tabular-nums">
                    {formatBRL(pricing.grossTotal)}
                  </span>
                </div>
              )}

              {orderType === 'frete' && (
                <>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>
                      Base {selectedModalRule.shortLabel} (até {pricing.baseKm} km)
                    </span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(pricing.baseComponent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>
                      Km adicional ({pricing.extraKm.toLocaleString('pt-BR')} km ×{' '}
                      {formatBRL(pricing.perKmRate)}/km)
                    </span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(pricing.extraDistanceComponent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>
                      Porte ({cargoSize === 'grande' ? 'Grande/Volumoso' : 'Médio'})
                    </span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(pricing.cargoSizeComponent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Ajudante de carga/descarga</span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(pricing.helperComponent)}
                    </span>
                  </div>
                </>
              )}

              <div className="space-y-2.5 border-t border-zinc-200 pt-3">
                <div className="flex items-center justify-between font-semibold text-zinc-900">
                  <span>Valor Total do Frete</span>
                  <span className="font-mono text-lg tabular-nums">
                    {formatBRL(pricing.grossTotal)}
                  </span>
                </div>

                {requestedVehicle === 'Bike' ? (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-zinc-600">
                        <span>Taxa operacional padrão (combustão)</span>
                        <span className="font-mono line-through tabular-nums">
                          {formatBRL(pricing.standardPlatformFee)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-emerald-800">
                        <span className="font-semibold">
                          Desconto Bike / E-Bike (-50%)
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          -{formatBRL(pricing.evBonus)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-zinc-900 border-t border-emerald-200/80 pt-1.5">
                        <span className="font-semibold">
                          Taxa Operacional com Desconto
                        </span>
                        <span className="font-mono font-bold text-emerald-800 tabular-nums">
                          -{formatBRL(pricing.evDiscountedFee)}
                        </span>
                      </div>
                      <p className="text-[11px] leading-snug text-zinc-600">
                        {PROGRESSIVE_PLATFORM_FEE_NOTE}
                      </p>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5">
                      <span className="text-xs sm:text-sm font-bold text-emerald-950">
                        Ganho Líquido do Entregador
                      </span>
                      <span className="font-mono text-base font-extrabold text-emerald-700 tabular-nums">
                        {formatBRL(pricing.evNetPayout)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 space-y-1">
                      <div className="flex items-center justify-between text-xs text-zinc-700">
                        <span className="font-semibold">
                          Taxa Operacional Inicial (Combustão)
                        </span>
                        <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                          -{formatBRL(pricing.standardPlatformFee)}
                        </span>
                      </div>
                      <p className="text-[11px] leading-snug text-zinc-500">
                        {PROGRESSIVE_PLATFORM_FEE_NOTE}
                      </p>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
                      <span className="text-xs sm:text-sm font-bold text-emerald-950">
                        Ganho Líquido do Entregador (Combustão)
                      </span>
                      <span className="font-mono text-base font-extrabold text-emerald-700 tabular-nums">
                        {formatBRL(pricing.basePayout)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {requestedVehicle !== 'Bike' && (
              <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/40 px-3.5 py-2.5 text-[11px] text-emerald-900 flex items-start gap-2">
                <Zap className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Desconto 50% Mobilidade Elétrica:</strong> se aceito por veículo{' '}
                  <strong>Elétrico</strong> (moto, ciclo ou carro elétrico), a taxa cai
                  automaticamente em 50% para{' '}
                  <strong className="font-mono">{formatBRL(pricing.evDiscountedFee)}</strong>{' '}
                  (desconto de <strong className="font-mono">{formatBRL(pricing.evBonus)}</strong>),
                  elevando o ganho líquido do entregador para{' '}
                  <strong className="font-mono">{formatBRL(pricing.evNetPayout)}</strong>.
                </span>
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* Orders List with Real-time Status + Map & Photo Proof Tracking */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-zinc-900">
              Pedidos Criados e Comprovantes de Entrega
            </h2>
            <p className="text-xs text-zinc-500">
              Acompanhe o mapa, recebedores e fotos de comprovação registradas pelos
              entregadores.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar #RS-XXXX ou bairro..."
                aria-label="Buscar pedidos por código #RS-XXXX ou bairro"
                className="w-full sm:w-56 rounded-lg border border-zinc-300 bg-white pl-8 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 overflow-x-auto">
              {(['Todos', 'Aguardando', 'Em Rota', 'Entregue'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      statusFilter === st
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center space-y-2">
            <p className="text-sm font-medium text-zinc-800">
              Nenhum pedido encontrado para esse filtro.
            </p>
            <p className="text-xs text-zinc-500">
              Publique uma nova entrega acima ou altere os filtros de busca.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white overflow-hidden">
            {filteredOrders.map((order) => {
              const deliveredStops = order.stops.filter((s) => s.delivered).length;
              const isExpanded = expandedOrderId === order.id;
              const orderScheduleLabel = formatPickupScheduleLabel(
                order.pickupSchedule
              );

              return (
                <div
                  key={order.id}
                  className="p-4 sm:p-5 transition-colors hover:bg-zinc-50/40"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-900">
                          {order.code}
                        </span>
                        <span aria-hidden="true">·</span>
                        {order.type === 'frete' ? (
                          <FreightBadge compact />
                        ) : (
                          <span>
                            {order.type === 'rapida'
                              ? `Entrega Rápida (${order.distanceKm?.toLocaleString('pt-BR')} km)`
                              : `Rota Consolidada (${order.packageCount} pacotes)`}
                          </span>
                        )}
                        {order.requestedVehicle && (
                          <span className="rounded bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-800">
                            {formatVehicleModalDisplayName(order.requestedVehicle)}
                          </span>
                        )}
                        {order.flowDirection === 'receber' && (
                          <span className="rounded bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">
                            Receber Item
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{order.merchantName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatDateTimeBR(order.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-zinc-900">
                        {order.pickupNeighborhood} ({order.pickupAddress}) →{' '}
                        {order.destinationNeighborhood}
                      </p>

                      {orderScheduleLabel && (
                        <p className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          <CalendarClock
                            className="h-3.5 w-3.5 text-amber-700 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{orderScheduleLabel}</span>
                        </p>
                      )}

                      {order.type === 'frete' && order.freightDetails && (
                        <p className="text-xs text-zinc-600">
                          Carga: <strong>{order.freightDetails.cargoDescription}</strong>{' '}
                          · Porte{' '}
                          {order.freightDetails.cargoSize === 'grande'
                            ? 'Grande/Volumoso'
                            : 'Médio'}{' '}
                          ·{' '}
                          {order.freightDetails.includeHelper
                            ? 'Com ajudante'
                            : 'Sem ajudante'}{' '}
                          · Acesso: {order.freightDetails.accessNote}
                        </p>
                      )}

                      {order.assignedCourierName && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-zinc-600">
                          <span>
                            Condutor:{' '}
                            <strong className="font-medium text-zinc-900">
                              {order.assignedCourierName}
                            </strong>
                          </span>
                          <RatingBadge
                            avg={order.assignedCourierRatingAvg}
                            count={order.assignedCourierRatingCount}
                            compact
                          />
                          <PropulsionTag
                            propulsion={order.assignedCourierPropulsion}
                            vehicleType={order.assignedCourierVehicleType}
                          />
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {deliveredStops}/{order.stops.length} paradas concluídas
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 lg:justify-end">
                      <div className="text-left lg:text-right">
                        <p className="font-mono text-sm font-bold text-zinc-900 tabular-nums">
                          {formatBRL(order.grossTotal)}
                        </p>
                        <p className="text-xs text-zinc-500 font-mono tabular-nums">
                          {hasCleanMobilityDiscount(
                            order.assignedCourierPropulsion,
                            order.assignedCourierVehicleType
                          )
                            ? `Líquido ${formatBRL(
                                order.netCourierPayout ?? order.basePayout
                              )} · Taxa ${formatBRL(
                                order.appliedPlatformFee ??
                                  Number((order.standardPlatformFee * 0.5).toFixed(2))
                              )} (-50%)`
                            : `Repasse ${formatBRL(
                                order.netCourierPayout ?? order.basePayout
                              )} · Taxa ${formatBRL(
                                order.appliedPlatformFee ?? order.standardPlatformFee
                              )}`}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <OrderStatusBadge status={order.status} />
                        {order.status !== 'Aguardando' && (
                          <PaymentStatusBadge
                            status={order.paymentStatus}
                            compact
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedOrderId(isExpanded ? null : order.id)
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          <span>Mapa e Paradas</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Cartão de Identificação Visual e Segurança do Entregador */}
                  {order.status !== 'Aguardando' && order.assignedCourierName && (() => {
                    const vehicleModelAndColor = formatVehicleModelAndColor(
                      order.assignedCourierVehicleModel,
                      order.assignedCourierVehicleColor
                    );
                    const isBikeCourier =
                      order.assignedCourierVehicleType === 'Bike';

                    return (
                      <div
                        className={`mt-4 rounded-xl border-2 p-3.5 sm:p-4 space-y-3 ${
                          order.status === 'Em Rota'
                            ? 'border-emerald-300 bg-emerald-50/50'
                            : 'border-zinc-200 bg-zinc-50/70'
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <CourierAvatar
                              name={order.assignedCourierName}
                              avatarUrl={order.assignedCourierAvatarUrl}
                              size="lg"
                            />
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                  <ShieldCheck
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  <span>Entregador Identificado</span>
                                </span>
                                <RatingBadge
                                  avg={order.assignedCourierRatingAvg}
                                  count={order.assignedCourierRatingCount}
                                  compact
                                />
                              </div>
                              <p className="font-display text-sm sm:text-base font-bold text-zinc-900">
                                {order.assignedCourierName}
                              </p>
                              <p className="text-xs text-zinc-600">
                                {order.assignedCourierVehicleType || 'Veículo'}
                                {vehicleModelAndColor
                                  ? ` · ${vehicleModelAndColor}`
                                  : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            {isBikeCourier ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs">
                                <Bike
                                  className="h-4 w-4 text-emerald-600"
                                  aria-hidden="true"
                                />
                                <span>Entrega de Bicicleta</span>
                              </span>
                            ) : (
                              <VehiclePlateBadge
                                plate={order.assignedCourierPlate}
                              />
                            )}
                          </div>
                        </div>

                        {order.status === 'Em Rota' && (
                          <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                            <ShieldCheck
                              className="h-4 w-4 text-amber-700 shrink-0"
                              aria-hidden="true"
                            />
                            <span>
                              Confira a foto, a{' '}
                              {isBikeCourier ? 'bicicleta' : 'placa'} e o código{' '}
                              <strong className="font-mono">{order.code}</strong>{' '}
                              antes de entregar o pacote.
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Aviso em Tempo Real do Entregador com 1 Toque */}
                  {order.status === 'Em Rota' && order.courierQuickNotice && (() => {
                    const notice = order.courierQuickNotice;
                    const meta = QUICK_NOTICE_META[notice.type];
                    const toneClasses =
                      meta.tone === 'emerald'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
                        : meta.tone === 'amber'
                        ? 'border-amber-500 bg-amber-50 text-amber-950'
                        : 'border-sky-500 bg-sky-50 text-sky-950';
                    const dotColor =
                      meta.tone === 'emerald'
                        ? 'bg-emerald-600'
                        : meta.tone === 'amber'
                        ? 'bg-amber-600'
                        : 'bg-sky-600';

                    return (
                      <div
                        role="status"
                        aria-live="polite"
                        className={`mt-4 rounded-xl border-2 p-3.5 sm:p-4 shadow-xs space-y-2 ${toneClasses}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                              <span
                                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`}
                              />
                              <span
                                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`}
                              />
                            </span>
                            <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="text-[11px] font-extrabold uppercase tracking-wider">
                              Aviso do Entregador em Tempo Real
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-zinc-950 px-2 py-0.5 font-mono text-xs font-black text-white">
                              {order.code}
                            </span>
                            <span className="font-mono text-[11px] opacity-80">
                              {formatDateTimeBR(notice.updatedAt)}
                            </span>
                          </div>
                        </div>

                        <p className="font-display text-sm sm:text-base font-extrabold leading-snug">
                          {meta.clientHeadline}
                          {notice.stopSequence && order.stops.length > 1
                            ? ` (Parada #${notice.stopSequence})`
                            : ''}
                        </p>

                        <p className="text-xs opacity-90">
                          {order.assignedCourierName
                            ? `Entregador: ${order.assignedCourierName} · `
                            : ''}
                          {meta.clientSubtext}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Código Único de Retirada em Destaque (#RS-XXXX) para Pedido Ativo */}
                  {order.status !== 'Entregue' && (
                    <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50/80 p-3.5 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-950 px-2.5 py-1 font-mono text-sm sm:text-base font-black tracking-wider text-white">
                            <Hash className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                            <span>{order.code.replace(/^#/, '')}</span>
                          </span>
                          <span className="text-xs font-semibold text-zinc-900">
                            Código de Retirada
                          </span>
                        </div>
                        <p className="text-xs font-medium text-amber-950 italic">
                          &ldquo;Anote ou identifique o pacote com este código para conferir na retirada&rdquo;
                        </p>
                      </div>

                      {order.type === 'rota' && order.stops.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-amber-200/80 pt-2 text-[11px]">
                          <span className="font-semibold text-amber-950 mr-1">
                            Pacotes:
                          </span>
                          {order.stops.map((stop) => (
                            <span
                              key={stop.id}
                              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-zinc-800"
                            >
                              <span>#{stop.sequence}:</span>
                              <strong className="font-mono text-zinc-950">
                                {stop.pickupCode || formatPickupCode(stop.id)}
                              </strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Financial Pix Card when order is accepted (Em Rota / Entregue) */}
                  {order.status !== 'Aguardando' && (() => {
                    const hasOrderDiscount = hasCleanMobilityDiscount(
                      order.assignedCourierPropulsion,
                      order.assignedCourierVehicleType
                    );
                    const appliedFee =
                      order.appliedPlatformFee ??
                      (hasOrderDiscount
                        ? Number((order.standardPlatformFee * 0.5).toFixed(2))
                        : order.standardPlatformFee);
                    const netCourierValue =
                      order.netCourierPayout ??
                      Number((order.grossTotal - appliedFee).toFixed(2));
                    const isPlatformPix = order.paymentMethod === 'pix_plataforma';
                    const settlementPixKey = isPlatformPix
                      ? platformPixKey
                      : order.assignedCourierPixKey;
                    const settlementAmount = isPlatformPix
                      ? order.grossTotal
                      : netCourierValue;
                    const settlementRecipient = isPlatformPix
                      ? 'RotaJusta Porto Alegre'
                      : order.assignedCourierName || 'Entregador';
                    const isQrVisible =
                      openPixQrOrderIds[order.id] ??
                      (!order.paymentStatus ||
                        order.paymentStatus === 'pendente_pagamento');

                    return (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-emerald-200/60 pb-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <QrCode
                              className="h-4 w-4 text-emerald-700 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="text-xs font-semibold text-zinc-900">
                              Pagamento Pix ({order.code}) ·{' '}
                              {formatPaymentMethodLabel(order.paymentMethod)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenPixQrOrderIds((prev) => ({
                                  ...prev,
                                  [order.id]: !isQrVisible,
                                }))
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 whitespace-nowrap"
                            >
                              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>
                                {isQrVisible
                                  ? 'Ocultar QR Code Pix'
                                  : 'Pagar via QR Code Pix'}
                              </span>
                            </button>
                            <PaymentStatusBadge status={order.paymentStatus} compact />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-zinc-500 block">Valor Total</span>
                            <strong className="font-mono text-sm font-bold text-zinc-900 tabular-nums">
                              {formatBRL(order.grossTotal)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">
                              Ganho Líquido do Entregador
                            </span>
                            <strong className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                              {formatBRL(netCourierValue)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">
                              {hasOrderDiscount
                                ? 'Taxa Operacional (-50% Bike/EV)'
                                : 'Taxa Operacional Inicial'}
                            </span>
                            <div className="flex flex-wrap items-baseline gap-1.5">
                              {hasOrderDiscount && (
                                <span className="font-mono text-xs text-zinc-400 line-through tabular-nums">
                                  {formatBRL(order.standardPlatformFee)}
                                </span>
                              )}
                              <strong className="font-mono text-sm font-semibold text-zinc-900 tabular-nums">
                                {formatBRL(appliedFee)}
                              </strong>
                            </div>
                            <span className="block text-[10px] text-zinc-500 mt-0.5">
                              {hasOrderDiscount
                                ? 'Desconto automático de 50% aplicado (Bike/Elétrico)'
                                : 'Reduz progressivamente conforme o volume da rede cresce'}
                            </span>
                          </div>
                        </div>

                        {isQrVisible && (
                          <PixQrCodeSettlement
                            orderCode={order.code}
                            amount={settlementAmount}
                            recipientName={settlementRecipient}
                            pixKey={settlementPixKey}
                            paymentStatus={order.paymentStatus}
                            viewerRole="merchant"
                            isConfirming={confirmingPayOrderId === order.id}
                            onConfirmAction={() => handleConfirmPixClick(order.id)}
                            confirmButtonLabel="Confirmar Pagamento Enviado"
                          />
                        )}

                        {!isPlatformPix ? (
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs">
                            <div className="space-y-0.5">
                              <p className="text-zinc-600">
                                Entregador:{' '}
                                <strong className="text-zinc-900">
                                  {order.assignedCourierName || 'Condutor'}
                                </strong>
                              </p>
                              <p className="text-zinc-600">
                                Chave Pix:{' '}
                                {order.assignedCourierPixKey ? (
                                  <code className="font-mono font-semibold text-zinc-900">
                                    {order.assignedCourierPixKey}
                                  </code>
                                ) : (
                                  <span className="text-amber-700 font-medium">
                                    Chave Pix ainda não cadastrada pelo entregador
                                  </span>
                                )}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {order.assignedCourierPixKey && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyPixKey(
                                      order.id,
                                      order.assignedCourierPixKey!
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                                >
                                  {copiedOrderId === order.id ? (
                                    <>
                                      <Check
                                        className="h-3.5 w-3.5 text-emerald-600"
                                        aria-hidden="true"
                                      />
                                      <span>Chave Copiada</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Copiar Chave Pix do Entregador</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {(!order.paymentStatus ||
                                order.paymentStatus === 'pendente_pagamento') && (
                                <button
                                  type="button"
                                  disabled={confirmingPayOrderId === order.id}
                                  onClick={() =>
                                    void handleConfirmPixClick(order.id)
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                                >
                                  <CheckCircle2
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {confirmingPayOrderId === order.id
                                      ? 'Confirmando...'
                                      : 'Confirmar Pix Realizado'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs">
                            <div className="space-y-0.5">
                              <p className="text-zinc-600">
                                Chave Pix Oficial{' '}
                                <strong className="text-zinc-900">RotaJusta</strong>:
                              </p>
                              <p>
                                {platformPixKey ? (
                                  <code className="font-mono font-semibold text-zinc-900">
                                    {platformPixKey}
                                  </code>
                                ) : (
                                  <span className="text-amber-700 font-medium">
                                    Chave oficial ainda não configurada no Admin
                                  </span>
                                )}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {platformPixKey && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyPixKey(order.id, platformPixKey)
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                                >
                                  {copiedOrderId === order.id ? (
                                    <>
                                      <Check
                                        className="h-3.5 w-3.5 text-emerald-600"
                                        aria-hidden="true"
                                      />
                                      <span>Chave Copiada</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Copiar Chave Pix</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {(!order.paymentStatus ||
                                order.paymentStatus === 'pendente_pagamento') && (
                                <button
                                  type="button"
                                  disabled={confirmingPayOrderId === order.id}
                                  onClick={() =>
                                    void handleConfirmPixClick(order.id)
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                                >
                                  <CheckCircle2
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {confirmingPayOrderId === order.id
                                      ? 'Confirmando...'
                                      : 'Confirmar Pagamento'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mutual Rating Box after Delivery Completed */}
                  {order.status === 'Entregue' && (
                    <div className="mt-3">
                      <OrderRatingBox
                        buttonLabel="Avaliar Entregador"
                        targetName={order.assignedCourierName || 'Entregador'}
                        commentPlaceholder="Comentário opcional: pontualidade, educação e cuidado com a carga..."
                        existingRating={ratings.find(
                          (r) =>
                            r.deliveryId === order.id &&
                            r.fromProfileId === evaluatorId
                        )}
                        canRate={Boolean(
                          evaluatorId && order.assignedCourierId
                        )}
                        unavailableNote="Avaliação disponível quando condutor e solicitante estiverem vinculados."
                        onSubmit={async (stars, comment) => {
                          if (!evaluatorId || !order.assignedCourierId) return;
                          await onSubmitRating({
                            deliveryId: order.id,
                            fromProfileId: evaluatorId,
                            toProfileId: order.assignedCourierId,
                            stars,
                            comment,
                          });
                        }}
                      />
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 border-t border-zinc-100 pt-4 grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                      <div className="lg:col-span-6">
                        <PortoAlegreMap
                          pickup={{
                            label: order.merchantName,
                            address: order.pickupAddress,
                            neighborhood: order.pickupNeighborhood,
                            lat: order.pickupLat,
                            lng: order.pickupLng,
                          }}
                          stops={order.stops}
                          orderCode={order.code}
                          heightClass="h-[270px]"
                          title={`Mapa ${order.code}`}
                        />
                      </div>

                      <div className="lg:col-span-6 space-y-2.5">
                        {order.stops.map((stop) => (
                          <div
                            key={stop.id}
                            className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs ${
                              stop.delivered
                                ? 'border-emerald-200 bg-emerald-50/40'
                                : 'border-zinc-200 bg-zinc-50'
                            }`}
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <p className="font-medium text-zinc-900">
                                <span className="font-mono text-zinc-500 mr-1.5">
                                  #{stop.sequence}
                                </span>
                                {order.type === 'rota' && (
                                  <span className="mr-1.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-zinc-900">
                                    {stop.pickupCode || formatPickupCode(stop.id)}
                                  </span>
                                )}
                                {stop.address}
                              </p>
                              <p className="text-zinc-500">
                                Bairro {stop.neighborhood}
                                {stop.expectedRecipient
                                  ? ` · Recebedor: ${stop.expectedRecipient}`
                                  : ''}
                                {stop.recipientNote ? ` · ${stop.recipientNote}` : ''}
                              </p>
                              {stop.delivered && stop.receiverName && (
                                <p className="text-emerald-700 font-semibold">
                                  Entregue para {stop.receiverName}
                                  {stop.deliveredAt
                                    ? ` (${formatDateTimeBR(stop.deliveredAt)})`
                                    : ''}
                                </p>
                              )}

                              {stop.proofPhotoDataUrl && (
                                <div className="pt-1.5 flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPhotoModal({
                                        src: stop.proofPhotoDataUrl!,
                                        caption: `${order.code} · Parada #${stop.sequence} — Recebido por ${stop.receiverName || 'Destinatário'}`,
                                      })
                                    }
                                    className="group relative overflow-hidden rounded-md border border-zinc-300 bg-white focus-visible:outline-2 focus-visible:outline-emerald-600"
                                  >
                                    <img
                                      src={stop.proofPhotoDataUrl}
                                      alt={`Comprovante visual da parada ${stop.sequence}`}
                                      className="h-14 w-20 object-cover transition-transform group-hover:scale-105"
                                    />
                                  </button>
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600">
                                    <Camera className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                                    <span>Comprovante anexado (clique p/ ampliar)</span>
                                  </span>
                                </div>
                              )}
                            </div>

                            {stop.delivered ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Entregue</span>
                              </span>
                            ) : (
                              <span className="text-amber-700 font-medium shrink-0">
                                Pendente
                              </span>
                            )}
                          </div>
                        ))}
                        {hasCleanMobilityDiscount(
                          order.assignedCourierPropulsion,
                          order.assignedCourierVehicleType
                        ) && (
                          <div className="pt-1 flex items-center gap-2 text-xs text-emerald-700">
                            <EvBadge
                              compact
                              propulsion={order.assignedCourierPropulsion}
                            />
                            <span>
                              Desconto automático de 50% aplicado na taxa operacional
                              da plataforma.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Photo Proof Lightbox Modal */}
      {photoModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comprovante de entrega"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4"
          onClick={() => setPhotoModal(null)}
        >
          <div
            className="max-w-xl w-full rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <p className="text-xs font-semibold text-zinc-900">
                {photoModal.caption}
              </p>
              <button
                type="button"
                onClick={() => setPhotoModal(null)}
                aria-label="Fechar foto"
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-zinc-100 p-3 flex justify-center">
              <img
                src={photoModal.src}
                alt={photoModal.caption}
                className="max-h-[70vh] rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
