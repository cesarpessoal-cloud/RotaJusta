import { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  MapPin,
  Package,
  Plus,
  QrCode,
  Search,
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
import {
  CargoSize,
  DeliveryStop,
  Order,
  OrderStatus,
  OrderType,
  PixPaymentMethod,
  Profile,
} from '../types';
import { formatPaymentMethodLabel } from '../utils/pix';
import {
  calculatePricing,
  formatBRL,
  formatDateTimeBR,
  isZeroFeePropulsion,
  PRICING_RULES,
} from '../utils/pricing';
import {
  EvBadge,
  FreightBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PropulsionTag,
} from './EvBadge';
import { MapStopPoint, PortoAlegreMap } from './PortoAlegreMap';

interface MerchantPanelProps {
  lockedMerchant?: Profile;
  orders: Order[];
  merchants: Profile[];
  activeMerchantId: string;
  platformPixKey: string | null;
  onSelectMerchant: (id: string) => void;
  onCreateOrder: (
    newOrder: Order
  ) => Promise<{ order: Order | null; errorMessage?: string }>;
  onConfirmPixPayment: (orderId: string) => Promise<void>;
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
  orders,
  merchants,
  activeMerchantId,
  platformPixKey,
  onSelectMerchant,
  onCreateOrder,
  onConfirmPixPayment,
  formRef,
}: MerchantPanelProps) {
  const activeMerchant = useMemo(
    () =>
      lockedMerchant ||
      merchants.find((m) => m.id === activeMerchantId) ||
      merchants[0],
    [lockedMerchant, merchants, activeMerchantId]
  );

  const [orderType, setOrderType] = useState<OrderType>('rapida');
  const [paymentMethod, setPaymentMethod] =
    useState<PixPaymentMethod>('pix_direto');
  const [pickupAddr, setPickupAddr] = useState<StructuredAddressValue>(() =>
    parseFullAddressLine(
      activeMerchant?.address || 'Rua dos Andradas, 1234',
      activeMerchant?.neighborhood || 'Centro Histórico'
    )
  );

  // Entrega Rápida & Pequeno Frete shared destination fields
  const [destAddr, setDestAddr] = useState<StructuredAddressValue>(() =>
    parseFullAddressLine('Av. Getúlio Vargas, 890', 'Menino Deus')
  );
  const [singleRecipientName, setSingleRecipientName] = useState<string>(
    'Marcos Teixeira'
  );
  const [recipientNote, setRecipientNote] = useState<string>(
    'Interfone 42 · Entregar na portaria'
  );
  const [distanceKm, setDistanceKm] = useState<number>(4.5);
  const [distanceAutoCalculated, setDistanceAutoCalculated] =
    useState<boolean>(false);

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

  const pricing = useMemo(
    () =>
      calculatePricing(orderType, distanceKm, effectivePackageCount, {
        cargoSize,
        includeHelper,
      }),
    [orderType, distanceKm, effectivePackageCount, cargoSize, includeHelper]
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

  const handleOrderTypeChange = (nextType: OrderType) => {
    setOrderType(nextType);
    setFormError('');
    if (nextType === 'frete' && !distanceAutoCalculated && distanceKm < 5) {
      setDistanceKm(6);
    }
  };

  const handleMerchantChange = (id: string) => {
    onSelectMerchant(id);
    const chosen = merchants.find((m) => m.id === id);
    if (chosen) {
      setPickupAddr(
        parseFullAddressLine(
          chosen.address || formatFullAddressLine(pickupAddr),
          chosen.neighborhood || 'Centro Histórico'
        )
      );
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!pickupAddr.street.trim()) {
      setFormError('Informe a rua e endereço de coleta em Porto Alegre.');
      return;
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
      stops = [
        {
          id: crypto.randomUUID(),
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
        return {
          id: crypto.randomUUID(),
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

    const nextNumber = 1041 + orders.length;
    const newOrder: Order = {
      id: crypto.randomUUID(),
      code: `RJ-${nextNumber}`,
      type: orderType,
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
        return (
          order.code.toLowerCase().includes(q) ||
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
            com repasse transparente e taxa zerada para veículos elétricos.
          </p>
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

      {/* Form + Live Map Preview & Transparent Pricing Breakdown */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5"
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
                <strong>Pequeno Frete (Utilitário / Mudança Rápida):</strong> base
                mínima R$ 80,00 (até 5 km) + R$ 3,50/km adicional. Taxa fixa de R$ 3,00
                (R$ 0,00 para utilitário elétrico).
              </p>
            )}
          </div>

          {/* Pickup Details */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
            <AddressAutocompleteFields
              idPrefix="pickup"
              sectionLabel={
                orderType === 'frete'
                  ? 'Origem da Carga / Coleta (CEP ou Busca Inteligente)'
                  : 'Endereço de Coleta (CEP ou Busca Inteligente)'
              }
              value={pickupAddr}
              onChange={handlePickupChange}
              streetPlaceholder="Ex: Rua dos Andradas"
              complementPlaceholder="Ex: Loja 2 / Fundos"
            />
          </div>

          {/* Service-specific fields */}
          {orderType === 'rapida' || orderType === 'frete' ? (
            <div className="space-y-4 border-t border-zinc-100 pt-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                <AddressAutocompleteFields
                  idPrefix="dest"
                  sectionLabel={
                    orderType === 'frete'
                      ? 'Destino do Pequeno Frete (CEP ou Busca Inteligente)'
                      : 'Endereço de Entrega (CEP ou Busca Inteligente)'
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
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    Nome do Recebedor
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
                  Pix Direto ao Entregador (Recomendado para Bike/Elétrico - Taxa Zero)
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Você copia a Chave Pix do condutor ao aceitar e transfere na hora
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
        <aside className="lg:col-span-5 space-y-5">
          <PortoAlegreMap
            pickup={previewPickup}
            stops={previewStops}
            heightClass="h-[290px]"
            title="Prévia da Rota em Porto Alegre"
          />

          <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
            <div className="border-b border-zinc-100 pb-4">
              <p className="text-xs font-medium text-emerald-700">
                Transparência Financeira
              </p>
              <h3 className="font-display text-lg font-semibold text-zinc-900">
                Resumo do Cálculo
              </h3>
            </div>

            <div className="space-y-3 text-sm">
              {orderType === 'rapida' && (
                <>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Tarifa base (até 3 km)</span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(PRICING_RULES.RAPIDA_BASE)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>
                      Adicional ({pricing.extraKm.toLocaleString('pt-BR')} km ×{' '}
                      {formatBRL(PRICING_RULES.RAPIDA_EXTRA_KM_RATE)})
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
                    {effectivePackageCount} paradas/pacotes ×{' '}
                    {formatBRL(PRICING_RULES.ROTA_PER_PACKAGE)}
                  </span>
                  <span className="font-mono font-medium text-zinc-900 tabular-nums">
                    {formatBRL(pricing.grossTotal)}
                  </span>
                </div>
              )}

              {orderType === 'frete' && (
                <>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>Base utilitário (até 5 km)</span>
                    <span className="font-mono font-medium text-zinc-900 tabular-nums">
                      {formatBRL(PRICING_RULES.FRETE_BASE)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-600">
                    <span>
                      Km adicional ({pricing.extraKm.toLocaleString('pt-BR')} km ×{' '}
                      {formatBRL(PRICING_RULES.FRETE_EXTRA_KM_RATE)})
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

              <div className="flex items-center justify-between border-t border-zinc-200 pt-3 font-semibold text-zinc-900">
                <span>Valor do pedido (Lojista)</span>
                <span className="font-mono text-lg tabular-nums">
                  {formatBRL(pricing.grossTotal)}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-800">
                    Se aceito por veículo a Combustão
                  </span>
                  <span className="text-xs text-zinc-500">Taxa fixa padrão</span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>Repasse líquido ao condutor</span>
                  <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                    {formatBRL(pricing.combustionNetPayout)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Taxa fixa RotaJusta</span>
                  <span className="font-mono tabular-nums">
                    {formatBRL(pricing.combustionPlatformFee)}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                    <Zap className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    Se aceito por Elétrico ou Bike
                  </span>
                  <span className="text-xs font-semibold text-emerald-700">
                    Taxa R$ 0,00
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-emerald-900">
                  <span>Repasse base + 100% Bônus EV</span>
                  <span className="font-mono text-sm font-bold text-emerald-800 tabular-nums">
                    {formatBRL(pricing.evNetPayout)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-emerald-700">
                  <span>Bônus de incentivo elétrico revertido</span>
                  <span className="font-mono font-medium tabular-nums">
                    +{formatBRL(pricing.evBonus)}
                  </span>
                </div>
              </div>
            </div>
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
                placeholder="Buscar código ou bairro..."
                aria-label="Buscar pedidos por código ou bairro"
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
                          <PropulsionTag propulsion={order.assignedCourierPropulsion} />
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
                          {isZeroFeePropulsion(order.assignedCourierPropulsion)
                            ? `Taxa R$ 0,00 · Bônus +${formatBRL(order.standardPlatformFee)}`
                            : `Repasse ${formatBRL(order.basePayout)} · Taxa ${formatBRL(
                                order.standardPlatformFee
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

                  {/* Financial Pix Card when order is accepted (Em Rota / Entregue) */}
                  {order.status !== 'Aguardando' && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-emerald-200/60 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <QrCode
                            className="h-4 w-4 text-emerald-700 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-semibold text-zinc-900">
                            Pagamento Pix ·{' '}
                            {formatPaymentMethodLabel(order.paymentMethod)}
                          </span>
                        </div>
                        <PaymentStatusBadge status={order.paymentStatus} compact />
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-zinc-500 block">Valor Total</span>
                          <strong className="font-mono text-sm font-bold text-zinc-900 tabular-nums">
                            {formatBRL(order.grossTotal)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">
                            Valor do Entregador
                          </span>
                          <strong className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                            {formatBRL(order.netCourierPayout ?? order.basePayout)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">
                            Taxa da Plataforma
                          </span>
                          <strong className="font-mono text-sm font-semibold text-zinc-900 tabular-nums">
                            {formatBRL(
                              order.appliedPlatformFee ?? order.standardPlatformFee
                            )}
                          </strong>
                        </div>
                      </div>

                      {order.paymentMethod !== 'pix_plataforma' ? (
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
                          heightClass="h-[260px]"
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
                        {isZeroFeePropulsion(order.assignedCourierPropulsion) && (
                          <div className="pt-1 flex items-center gap-2 text-xs text-emerald-700">
                            <EvBadge
                              compact
                              propulsion={order.assignedCourierPropulsion}
                            />
                            <span>
                              100% da taxa foi revertida como incentivo de mobilidade
                              limpa.
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
