import { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Bike,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Hash,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  QrCode,
  ShieldCheck,
  Trash2,
  Truck,
  User,
  UserCheck,
  Volume2,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  buildGoogleMapsStopUrl,
  buildWazeStopUrl,
} from '../constants/portoAlegre';
import {
  CourierQuickNoticeType,
  Order,
  PixKeyType,
  Profile,
  PropulsionType,
  Rating,
  VehicleType,
} from '../types';
import { updateCourierIdentityInSupabase } from '../lib/supabaseService';
import {
  formatPlateInput,
  formatVehicleModelAndColor,
  isValidBrazilianPlate,
} from '../utils/courierIdentity';
import { formatCpfOrCnpj } from '../utils/documentValidation';
import { compressImageToJpeg } from '../utils/imageCompression';
import {
  formatPaymentMethodLabel,
  getPixKeyPlaceholder,
  inferPixKeyType,
  PIX_KEY_TYPES,
} from '../utils/pix';
import {
  formatBRL,
  formatDateTimeBR,
  getCourierSettlementForOrder,
  isZeroFeePropulsion,
} from '../utils/pricing';
import { formatPickupCode } from '../utils/pickupCode';
import {
  buildQuickNoticeWhatsAppMessage,
  buildWhatsAppUrl,
  extractBrPhoneDigits,
  QUICK_NOTICE_META,
} from '../utils/quickNotice';
import { formatPickupScheduleLabel } from '../utils/schedule';
import {
  BIKE_RADIUS_OPTIONS,
  getEffectiveBikeRadiusKm,
  getPropulsionOptionsForVehicle,
  getVehicleCompatibilityLabel,
  sortCompatibleOrdersForVehicle,
  VEHICLE_CATEGORIES,
} from '../utils/vehicleCompatibility';
import { CourierAvatar, VehiclePlateBadge } from './CourierAvatar';
import {
  ApprovalStatusBadge,
  EvBadge,
  FreightBadge,
  OrderStatusBadge,
  PropulsionTag,
} from './EvBadge';
import { PortoAlegreMap } from './PortoAlegreMap';
import { OrderRatingBox, RatingBadge } from './RatingWidgets';

export type CourierTabId = 'ofertas' | 'financeiro' | 'perfil';

interface CourierBoardProps {
  lockedCourier?: Profile;
  approvedCouriers: Profile[];
  pendingCouriersCount: number;
  waitingOrders: Order[];
  orders: Order[];
  ratings: Rating[];
  activeCourierId: string;
  onSelectCourier: (id: string) => void;
  onAcceptOrder: (orderId: string, courier: Profile) => Promise<void>;
  onSendQuickNotice?: (
    orderId: string,
    noticeType: CourierQuickNoticeType,
    stopSequence?: number
  ) => Promise<void>;
  onConfirmStop: (
    orderId: string,
    stopId: string,
    receiverName: string,
    proofPhotoDataUrl?: string
  ) => Promise<void>;
  onCompleteOrder: (orderId: string) => Promise<void>;
  onUpdateBikeRadius: (courierId: string, radiusKm: number | null) => Promise<void>;
  onToggleOnlineStatus: (courierId: string, isOnline: boolean) => Promise<void>;
  onTestSoundAlert: () => Promise<void>;
  onUpdateCourierPixKey: (courierId: string, pixKey: string) => Promise<void>;
  onConfirmCourierPixReceipt: (orderId: string) => Promise<void>;
  onCourierProfileUpdated?: (updated: Profile) => void;
  onSubmitRating: (params: {
    deliveryId: string;
    fromProfileId: string;
    toProfileId: string;
    stars: number;
    comment?: string;
  }) => Promise<void>;
}

export function CourierBoard({
  lockedCourier,
  approvedCouriers,
  pendingCouriersCount,
  waitingOrders,
  orders,
  ratings,
  activeCourierId,
  onSelectCourier,
  onAcceptOrder,
  onSendQuickNotice,
  onConfirmStop,
  onCompleteOrder,
  onUpdateBikeRadius,
  onToggleOnlineStatus,
  onTestSoundAlert,
  onUpdateCourierPixKey,
  onConfirmCourierPixReceipt,
  onCourierProfileUpdated,
  onSubmitRating,
}: CourierBoardProps) {
  const activeCourier = useMemo(() => {
    if (lockedCourier) return lockedCourier;
    return (
      approvedCouriers.find((c) => c.id === activeCourierId) ??
      approvedCouriers[0]
    );
  }, [lockedCourier, approvedCouriers, activeCourierId]);

  const [activeTab, setActiveTab] = useState<CourierTabId>('ofertas');

  const [confirmingStopId, setConfirmingStopId] = useState<string | null>(null);
  const [receiverInputs, setReceiverInputs] = useState<Record<string, string>>({});
  const [photoInputs, setPhotoInputs] = useState<Record<string, string>>({});
  const [compressingStopId, setCompressingStopId] = useState<string | null>(null);
  const [stopErrors, setStopErrors] = useState<Record<string, string>>({});
  const [previewMapOrderId, setPreviewMapOrderId] = useState<string | null>(null);
  const [gpsStageByOrder, setGpsStageByOrder] = useState<
    Record<string, 'pickup' | 'delivery'>
  >({});
  const [sendingNoticeKey, setSendingNoticeKey] = useState<string | null>(null);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);
  const [isTestingSound, setIsTestingSound] = useState(false);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);

  // Financeiro & Pix states
  const [pixFilter, setPixFilter] = useState<'todas' | 'confirmadas' | 'pendentes'>(
    'todas'
  );
  const [pixTypeDraft, setPixTypeDraft] = useState<PixKeyType>(() =>
    inferPixKeyType(activeCourier?.pixKey)
  );
  const [pixKeyDraft, setPixKeyDraft] = useState<string>(
    activeCourier?.pixKey || ''
  );
  const [isSavingPix, setIsSavingPix] = useState(false);
  const [pixFeedback, setPixFeedback] = useState<string | null>(null);
  const [confirmingReceiptOrderId, setConfirmingReceiptOrderId] = useState<
    string | null
  >(null);

  // Identidade Visual & Veículo (Tab 3)
  const [avatarDraft, setAvatarDraft] = useState<string>(
    activeCourier?.avatarUrl || ''
  );
  const [vehicleTypeDraft, setVehicleTypeDraft] = useState<VehicleType>(
    activeCourier?.vehicleType || 'Moto'
  );
  const [propulsionDraft, setPropulsionDraft] = useState<PropulsionType>(
    activeCourier?.propulsion || 'Combustão'
  );
  const [vehicleModelDraft, setVehicleModelDraft] = useState<string>(
    activeCourier?.vehicleModel || ''
  );
  const [vehicleColorDraft, setVehicleColorDraft] = useState<string>(
    activeCourier?.vehicleColor || ''
  );
  const [plateDraft, setPlateDraft] = useState<string>(
    activeCourier?.plate || ''
  );
  const [isCompressingAvatar, setIsCompressingAvatar] = useState(false);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [identityFeedback, setIdentityFeedback] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    setPixTypeDraft(inferPixKeyType(activeCourier?.pixKey));
    setPixKeyDraft(activeCourier?.pixKey || '');
    setPixFeedback(null);
  }, [activeCourier?.id, activeCourier?.pixKey]);

  useEffect(() => {
    setAvatarDraft(activeCourier?.avatarUrl || '');
    const vType: VehicleType = activeCourier?.vehicleType || 'Moto';
    setVehicleTypeDraft(vType);
    const allowed = getPropulsionOptionsForVehicle(vType);
    setPropulsionDraft(
      activeCourier?.propulsion && allowed.includes(activeCourier.propulsion)
        ? activeCourier.propulsion
        : allowed[0]
    );
    setVehicleModelDraft(activeCourier?.vehicleModel || '');
    setVehicleColorDraft(activeCourier?.vehicleColor || '');
    setPlateDraft(activeCourier?.plate || '');
    setIdentityFeedback(null);
    setIdentityError(null);
  }, [
    activeCourier?.id,
    activeCourier?.avatarUrl,
    activeCourier?.vehicleType,
    activeCourier?.propulsion,
    activeCourier?.vehicleModel,
    activeCourier?.vehicleColor,
    activeCourier?.plate,
  ]);

  const allWaitingOrders = waitingOrders;

  const isBike = activeCourier?.vehicleType === 'Bike';
  const effectiveBikeRadius = useMemo(
    () => (isBike ? getEffectiveBikeRadiusKm(activeCourier?.bikeMaxRadiusKm) : null),
    [isBike, activeCourier?.bikeMaxRadiusKm]
  );

  const compatibleAvailableOrders = useMemo(() => {
    if (!activeCourier) return [];
    return sortCompatibleOrdersForVehicle(
      allWaitingOrders,
      activeCourier.vehicleType,
      activeCourier.bikeMaxRadiusKm
    );
  }, [allWaitingOrders, activeCourier]);

  const exceededBikeRadiusCount = useMemo(() => {
    if (!isBike || effectiveBikeRadius === null) return 0;
    return allWaitingOrders.filter(
      (o) => o.type === 'rapida' && (o.distanceKm ?? 1) > effectiveBikeRadius
    ).length;
  }, [isBike, effectiveBikeRadius, allWaitingOrders]);

  const hiddenIncompatibleCount =
    allWaitingOrders.length - compatibleAvailableOrders.length;

  const myActiveOrders = useMemo(() => {
    if (!activeCourier) return [];
    return orders.filter(
      (o) => o.status === 'Em Rota' && o.assignedCourierId === activeCourier.id
    );
  }, [orders, activeCourier]);

  const myCompletedOrders = useMemo(() => {
    if (!activeCourier) return [];
    return orders.filter(
      (o) => o.status === 'Entregue' && o.assignedCourierId === activeCourier.id
    );
  }, [orders, activeCourier]);

  const earningsSummary = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const sevenDaysAgoMs = startOfToday - 6 * 24 * 60 * 60 * 1000;

    const getOrderTimestamp = (ord: Order) => {
      const raw = ord.completedAt || ord.createdAt;
      const t = raw ? new Date(raw).getTime() : 0;
      return Number.isNaN(t) ? 0 : t;
    };

    const completedToday = myCompletedOrders.filter(
      (ord) => getOrderTimestamp(ord) >= startOfToday
    );
    const completedWeek = myCompletedOrders.filter(
      (ord) => getOrderTimestamp(ord) >= sevenDaysAgoMs
    );

    const completedTodayNet = completedToday.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );
    const completedWeekNet = completedWeek.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );
    const completedNet = myCompletedOrders.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );
    const completedEvBonus = myCompletedOrders.reduce(
      (acc, ord) => acc + (ord.evBonusApplied ?? 0),
      0
    );

    const confirmedPixOrders = myCompletedOrders.filter(
      (ord) =>
        ord.paymentStatus === 'repassado' ||
        ord.paymentStatus === 'pago_lojista'
    );
    const awaitingMerchantPixOrders = myCompletedOrders.filter(
      (ord) => !ord.paymentStatus || ord.paymentStatus === 'pendente_pagamento'
    );
    const unconfirmedReceiptCount = myCompletedOrders.filter(
      (ord) => ord.paymentStatus !== 'repassado'
    ).length;

    const confirmedPixAmount = confirmedPixOrders.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );
    const awaitingMerchantPixAmount = awaitingMerchantPixOrders.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );

    return {
      completedTodayCount: completedToday.length,
      completedTodayNet,
      completedWeekCount: completedWeek.length,
      completedWeekNet,
      completedCount: myCompletedOrders.length,
      completedNet,
      completedEvBonus,
      confirmedPixCount: confirmedPixOrders.length,
      confirmedPixAmount,
      awaitingMerchantPixCount: awaitingMerchantPixOrders.length,
      awaitingMerchantPixAmount,
      unconfirmedReceiptCount,
    };
  }, [myCompletedOrders]);

  const filteredCompletedOrders = useMemo(() => {
    if (pixFilter === 'confirmadas') {
      return myCompletedOrders.filter(
        (ord) =>
          ord.paymentStatus === 'repassado' ||
          ord.paymentStatus === 'pago_lojista'
      );
    }
    if (pixFilter === 'pendentes') {
      return myCompletedOrders.filter(
        (ord) =>
          !ord.paymentStatus || ord.paymentStatus === 'pendente_pagamento'
      );
    }
    return myCompletedOrders;
  }, [myCompletedOrders, pixFilter]);

  const handleOpenConfirmForm = (stopId: string) => {
    setConfirmingStopId(stopId);
    setStopErrors((prev) => {
      const copy = { ...prev };
      delete copy[stopId];
      return copy;
    });
  };

  const handlePhotoSelected = async (
    stopId: string,
    file: File | undefined
  ) => {
    if (!file) return;
    setCompressingStopId(stopId);
    setStopErrors((prev) => {
      const copy = { ...prev };
      delete copy[stopId];
      return copy;
    });

    try {
      const compressedDataUrl = await compressImageToJpeg(file, 600, 0.72);
      setPhotoInputs((prev) => ({
        ...prev,
        [stopId]: compressedDataUrl,
      }));
    } catch (err) {
      setStopErrors((prev) => ({
        ...prev,
        [stopId]:
          err instanceof Error
            ? err.message
            : 'Erro ao processar a foto do comprovante.',
      }));
    } finally {
      setCompressingStopId(null);
    }
  };

  const handleRemovePhoto = (stopId: string) => {
    setPhotoInputs((prev) => {
      const copy = { ...prev };
      delete copy[stopId];
      return copy;
    });
  };

  const handleStopConfirmSubmit = async (orderId: string, stopId: string) => {
    const name = (receiverInputs[stopId] || '').trim();
    if (!name) {
      setStopErrors((prev) => ({
        ...prev,
        [stopId]: 'Informe o nome de quem recebeu (ex: Marcos / Portaria).',
      }));
      return;
    }

    const photo = photoInputs[stopId];
    setStopErrors((prev) => {
      const copy = { ...prev };
      delete copy[stopId];
      return copy;
    });
    await onConfirmStop(orderId, stopId, name, photo);
    setConfirmingStopId(null);
    setReceiverInputs((prev) => {
      const copy = { ...prev };
      delete copy[stopId];
      return copy;
    });
    setPhotoInputs((prev) => {
      const copy = { ...prev };
      delete copy[stopId];
      return copy;
    });
  };

  const handleSavePixKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourier) return;
    setPixFeedback(null);
    setIsSavingPix(true);
    try {
      await onUpdateCourierPixKey(activeCourier.id, pixKeyDraft.trim());
      setPixFeedback('Chave Pix atualizada com sucesso!');
    } finally {
      setIsSavingPix(false);
    }
  };

  const handleConfirmReceiptClick = async (orderId: string) => {
    setConfirmingReceiptOrderId(orderId);
    try {
      await onConfirmCourierPixReceipt(orderId);
    } finally {
      setConfirmingReceiptOrderId(null);
    }
  };

  const handleAcceptClick = async (orderId: string) => {
    if (!activeCourier) return;
    setAcceptingOrderId(orderId);
    try {
      await onAcceptOrder(orderId, activeCourier);
    } finally {
      setAcceptingOrderId(null);
    }
  };

  if (!activeCourier) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center space-y-2">
        <h2 className="font-display text-lg font-semibold text-zinc-900">
          Nenhum entregador aprovado ativo
        </h2>
        <p className="text-sm text-zinc-600 max-w-md mx-auto">
          Aprove um entregador ou motorista no Painel Admin para operar o Mural do
          Entregador.
        </p>
      </div>
    );
  }

  const isZeroFee = isZeroFeePropulsion(activeCourier.propulsion);
  const offersBadgeCount = myActiveOrders.length + compatibleAvailableOrders.length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 md:pb-6">
      {/* Admin Supervision Switcher (only visible in Admin supervision mode) */}
      {!lockedCourier && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-emerald-700">
              Modo Supervisão Admin · Condutor Ativo
            </p>
            <p className="text-xs text-zinc-500">
              {activeCourier.vehicleType} · {activeCourier.propulsion}
              {pendingCouriersCount > 0
                ? ` · +${pendingCouriersCount} aguardando aprovação`
                : ''}
            </p>
          </div>
          <select
            id="active-courier-select"
            aria-label="Selecionar condutor para supervisão"
            value={activeCourier.id}
            onChange={(e) => onSelectCourier(e.target.value)}
            className="w-full sm:w-80 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
          >
            {approvedCouriers.map((courier) => (
              <option key={courier.id} value={courier.id}>
                {courier.name} — {courier.vehicleType} ({courier.propulsion})
              </option>
            ))}
          </select>
        </section>
      )}

      {/* Desktop Top 3-Tab Navigation (Mobile uses fixed bottom thumb bar below) */}
      <nav
        aria-label="Navegação do Entregador"
        className="hidden md:grid grid-cols-3 gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100 p-1.5"
      >
        <button
          type="button"
          onClick={() => setActiveTab('ofertas')}
          className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'ofertas'
              ? 'bg-white text-emerald-800 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <span aria-hidden="true">🛵</span>
          <span>Ofertas & Em Rota</span>
          {offersBadgeCount > 0 && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-800 tabular-nums">
              {offersBadgeCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('financeiro')}
          className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'financeiro'
              ? 'bg-white text-emerald-800 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <span aria-hidden="true">💰</span>
          <span>Financeiro & Ganhos</span>
          {earningsSummary.unconfirmedReceiptCount > 0 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-bold text-amber-800 tabular-nums">
              {earningsSummary.unconfirmedReceiptCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('perfil')}
          className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'perfil'
              ? 'bg-white text-emerald-800 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <span aria-hidden="true">👤</span>
          <span>Meu Perfil & Veículo</span>
        </button>
      </nav>

      {/* ===================================================================== */}
      {/* TAB 1: 🛵 OFERTAS & EM ROTA (FOCO TOTAL NA OPERAÇÃO DE RUA)           */}
      {/* ===================================================================== */}
      {activeTab === 'ofertas' && (
        <div className="space-y-6">
          {/* Top Bar: ONLY Online/Offline Switch + Testar Som de Alerta */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={isTogglingOnline}
              onClick={async () => {
                setIsTogglingOnline(true);
                try {
                  await onToggleOnlineStatus(
                    activeCourier.id,
                    !activeCourier.isOnline
                  );
                } finally {
                  setIsTogglingOnline(false);
                }
              }}
              className={`min-h-[52px] w-full sm:w-auto inline-flex items-center justify-center gap-3 rounded-xl border-2 px-5 py-3 text-sm sm:text-base font-bold transition-all shadow-xs disabled:opacity-60 ${
                activeCourier.isOnline
                  ? 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100'
              }`}
            >
              <span>
                {isTogglingOnline
                  ? 'Sincronizando...'
                  : activeCourier.isOnline
                  ? '🟢 ONLINE (Recebendo Ofertas)'
                  : '🔴 OFFLINE — Toque para ficar Online'}
              </span>
            </button>

            <button
              type="button"
              disabled={isTestingSound}
              onClick={async () => {
                setIsTestingSound(true);
                try {
                  await onTestSoundAlert();
                } finally {
                  setIsTestingSound(false);
                }
              }}
              className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-xs sm:text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Volume2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span>
                {isTestingSound ? 'Tocando alerta...' : 'Testar Som de Alerta'}
              </span>
            </button>
          </section>

          {/* Featured Card: Entrega / Frete em Andamento */}
          {myActiveOrders.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-900">
                    Entrega / Frete em Andamento
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Siga a rota no mapa, abra no GPS e registre a foto de
                    comprovação em cada parada.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                  {myActiveOrders.length} ativa(s)
                </span>
              </div>

              <div className="space-y-5">
                {myActiveOrders.map((order) => {
                  const deliveredCount = order.stops.filter(
                    (s) => s.delivered
                  ).length;
                  const allStopsDelivered =
                    order.stops.length > 0 &&
                    deliveredCount === order.stops.length;
                  const settlement = getCourierSettlementForOrder(
                    order,
                    activeCourier.propulsion || 'Combustão'
                  );
                  const scheduleLabel = formatPickupScheduleLabel(
                    order.pickupSchedule
                  );
                  const nextPendingStop =
                    order.stops.find((s) => !s.delivered) || order.stops[0];
                  const gpsStage: 'pickup' | 'delivery' =
                    gpsStageByOrder[order.id] ??
                    (deliveredCount > 0 ? 'delivery' : 'pickup');
                  const gpsTarget =
                    gpsStage === 'pickup' || !nextPendingStop
                      ? {
                          label: 'Ponto de Coleta',
                          address: order.pickupAddress,
                          neighborhood: order.pickupNeighborhood,
                          lat: order.pickupLat,
                          lng: order.pickupLng,
                        }
                      : {
                          label:
                            order.stops.length > 1
                              ? `Entrega #${nextPendingStop.sequence}`
                              : 'Ponto de Entrega',
                          address: nextPendingStop.address,
                          neighborhood: nextPendingStop.neighborhood,
                          lat: nextPendingStop.lat,
                          lng: nextPendingStop.lng,
                        };
                  const googleMapsNavUrl = buildGoogleMapsStopUrl(gpsTarget);
                  const wazeNavUrl = buildWazeStopUrl(gpsTarget);

                  const pickupContactPhone =
                    order.merchantPhone ||
                    (extractBrPhoneDigits(order.pickupAddress)
                      ? order.pickupAddress
                      : null);
                  const deliveryContactPhone =
                    (nextPendingStop &&
                    extractBrPhoneDigits(nextPendingStop.recipientNote)
                      ? nextPendingStop.recipientNote
                      : nextPendingStop &&
                        extractBrPhoneDigits(nextPendingStop.expectedRecipient)
                      ? nextPendingStop.expectedRecipient
                      : null) ||
                    (order.flowDirection === 'receber'
                      ? order.merchantPhone
                      : order.merchantPhone);

                  const activeNotice = order.courierQuickNotice;
                  const whatsappMessage = buildQuickNoticeWhatsAppMessage({
                    stage: gpsStage,
                    orderCode: order.code,
                    activeNoticeType: activeNotice?.type,
                    courierName: activeCourier.name,
                    vehicleType: activeCourier.vehicleType,
                    vehicleModel: activeCourier.vehicleModel,
                    vehicleColor: activeCourier.vehicleColor,
                    vehiclePlate: activeCourier.plate,
                  });
                  const whatsappHref = buildWhatsAppUrl({
                    phone:
                      gpsStage === 'pickup'
                        ? pickupContactPhone
                        : deliveryContactPhone,
                    message: whatsappMessage,
                  });

                  const triggerQuickNotice = async (
                    noticeType: CourierQuickNoticeType
                  ) => {
                    if (!onSendQuickNotice) return;
                    const key = `${order.id}:${noticeType}`;
                    setSendingNoticeKey(key);
                    try {
                      await onSendQuickNotice(
                        order.id,
                        noticeType,
                        gpsStage === 'delivery'
                          ? nextPendingStop?.sequence
                          : undefined
                      );
                    } finally {
                      setSendingNoticeKey(null);
                    }
                  };

                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl border-2 border-emerald-500/70 bg-white p-4 sm:p-5 space-y-5 shadow-xs"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="font-mono font-bold text-zinc-900">
                              {order.code}
                            </span>
                            <span aria-hidden="true">·</span>
                            {order.type === 'frete' && <FreightBadge compact />}
                            <span>{order.merchantName}</span>
                            <RatingBadge
                              avg={order.merchantRatingAvg}
                              count={order.merchantRatingCount}
                              compact
                            />
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                              {deliveredCount}/{order.stops.length} paradas
                            </span>
                          </div>
                          <h3 className="font-display text-base sm:text-lg font-bold text-zinc-900">
                            Coleta: {order.pickupNeighborhood} ({order.pickupAddress}
                            ) → {order.destinationNeighborhood}
                          </h3>
                          {scheduleLabel && (
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                              <CalendarClock
                                className="h-3.5 w-3.5 text-amber-700 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{scheduleLabel}</span>
                            </div>
                          )}
                          {order.flowDirection === 'receber' && (
                            <p className="text-[11px] font-medium text-sky-800">
                              Retirada em terceiros · Entrega direta ao solicitante
                            </p>
                          )}
                          {order.type === 'frete' && order.freightDetails && (
                            <p className="text-xs text-zinc-600">
                              Carga:{' '}
                              <strong>
                                {order.freightDetails.cargoDescription}
                              </strong>{' '}
                              ·{' '}
                              {order.freightDetails.includeHelper
                                ? 'Com ajudante (+R$ 40,00)'
                                : 'Sem ajudante'}{' '}
                              · Acesso: {order.freightDetails.accessNote}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-left sm:text-right">
                            <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                              {formatBRL(settlement.netPayout)}
                            </p>
                            <p className="text-xs text-zinc-500 font-mono tabular-nums">
                              {settlement.evBonus > 0
                                ? `Taxa Zero (+${formatBRL(settlement.evBonus)} EV)`
                                : `Taxa ${formatBRL(settlement.platformFee)}`}
                            </p>
                          </div>
                          <OrderStatusBadge status={order.status} />
                        </div>
                      </div>

                      {/* Código Único de Retirada em Destaque (#RS-XXXX) */}
                      <div className="rounded-2xl border-2 border-zinc-900 bg-amber-50 p-4 sm:p-5 space-y-3 shadow-xs">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-900">
                              <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Código Único de Retirada</span>
                            </span>
                            <p className="font-mono text-2xl sm:text-3xl font-black tracking-wider text-zinc-950">
                              {order.code}
                            </p>
                          </div>

                          <div className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-zinc-900">
                            Informe este código no balcão na hora da retirada
                          </div>
                        </div>

                        {order.type === 'rota' && order.stops.length > 0 && (
                          <div className="border-t border-amber-200 pt-2.5 space-y-1.5">
                            <p className="text-[11px] font-semibold text-amber-950">
                              Códigos individuais dos pacotes desta Rota Consolidada:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {order.stops.map((stop) => (
                                <span
                                  key={stop.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs text-zinc-800"
                                >
                                  <span className="font-semibold">
                                    Pacote #{stop.sequence}:
                                  </span>
                                  <span className="font-mono font-extrabold text-zinc-950">
                                    {stop.pickupCode || formatPickupCode(stop.id)}
                                  </span>
                                  {stop.expectedRecipient && (
                                    <span className="text-zinc-500">
                                      ({stop.expectedRecipient})
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Aviso Rápido com 1 Toque + WhatsApp Direto */}
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                              <BellRing className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-zinc-900">
                                Aviso Rápido com 1 Toque ao Cliente ({order.code})
                              </h4>
                              <p className="text-[11px] text-zinc-600">
                                Atualiza o painel do cliente em tempo real para
                                evitar espera na rua.
                              </p>
                            </div>
                          </div>

                          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[11px] font-semibold self-start sm:self-center">
                            <button
                              type="button"
                              onClick={() =>
                                setGpsStageByOrder((prev) => ({
                                  ...prev,
                                  [order.id]: 'pickup',
                                }))
                              }
                              className={`rounded-md px-2.5 py-1 transition-colors ${
                                gpsStage === 'pickup'
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-zinc-600 hover:text-zinc-900'
                              }`}
                            >
                              Etapa: Coleta
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setGpsStageByOrder((prev) => ({
                                  ...prev,
                                  [order.id]: 'delivery',
                                }))
                              }
                              className={`rounded-md px-2.5 py-1 transition-colors ${
                                gpsStage === 'delivery'
                                  ? 'bg-orange-600 text-white'
                                  : 'text-zinc-600 hover:text-zinc-900'
                              }`}
                            >
                              Etapa: Entrega
                            </button>
                          </div>
                        </div>

                        {gpsStage === 'pickup' ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <button
                              type="button"
                              disabled={
                                sendingNoticeKey ===
                                `${order.id}:chegando_coleta`
                              }
                              onClick={() =>
                                void triggerQuickNotice('chegando_coleta')
                              }
                              className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                                activeNotice?.type === 'chegando_coleta'
                                  ? 'border-blue-700 bg-blue-700 text-white shadow-xs'
                                  : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              <BellRing
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span>
                                {sendingNoticeKey ===
                                `${order.id}:chegando_coleta`
                                  ? 'Enviando...'
                                  : QUICK_NOTICE_META.chegando_coleta
                                      .courierButtonLabel}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={
                                sendingNoticeKey ===
                                `${order.id}:chegou_coleta`
                              }
                              onClick={() =>
                                void triggerQuickNotice('chegou_coleta')
                              }
                              className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                                activeNotice?.type === 'chegou_coleta'
                                  ? 'border-amber-600 bg-amber-600 text-white shadow-xs'
                                  : 'border-amber-500 bg-amber-500 text-zinc-950 hover:bg-amber-600 hover:text-white'
                              }`}
                            >
                              <MapPin
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span>
                                {sendingNoticeKey ===
                                `${order.id}:chegou_coleta`
                                  ? 'Enviando...'
                                  : QUICK_NOTICE_META.chegou_coleta
                                      .courierButtonLabel}
                              </span>
                            </button>

                            <a
                              href={whatsappHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-green-600 bg-green-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-green-700 shadow-xs"
                            >
                              <MessageCircle
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span>Enviar no WhatsApp</span>
                              <ExternalLink
                                className="h-3.5 w-3.5 shrink-0 opacity-85"
                                aria-hidden="true"
                              />
                            </a>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              disabled={
                                sendingNoticeKey ===
                                `${order.id}:chegando_entrega`
                              }
                              onClick={() =>
                                void triggerQuickNotice('chegando_entrega')
                              }
                              className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                                activeNotice?.type === 'chegando_entrega'
                                  ? 'border-emerald-700 bg-emerald-700 text-white shadow-xs'
                                  : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                            >
                              <BellRing
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span>
                                {sendingNoticeKey ===
                                `${order.id}:chegando_entrega`
                                  ? 'Enviando...'
                                  : QUICK_NOTICE_META.chegando_entrega
                                      .courierButtonLabel}
                              </span>
                            </button>

                            <a
                              href={whatsappHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-green-600 bg-green-600 px-3.5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-green-700 shadow-xs"
                            >
                              <MessageCircle
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span>Enviar no WhatsApp</span>
                              <ExternalLink
                                className="h-3.5 w-3.5 shrink-0 opacity-85"
                                aria-hidden="true"
                              />
                            </a>
                          </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px]">
                          {activeNotice ? (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
                              <CheckCircle2
                                className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                                aria-hidden="true"
                              />
                              <span>
                                Aviso ativo para o cliente: &ldquo;
                                {activeNotice.message}&rdquo; ·{' '}
                                {formatDateTimeBR(activeNotice.updatedAt)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-zinc-500">
                              Toque em um aviso acima para notificar o cliente
                              instantaneamente no app ou via WhatsApp.
                            </span>
                          )}

                          {gpsStage === 'pickup' && (
                            <button
                              type="button"
                              onClick={() =>
                                setGpsStageByOrder((prev) => ({
                                  ...prev,
                                  [order.id]: 'delivery',
                                }))
                              }
                              className="font-bold text-orange-700 hover:text-orange-800 underline underline-offset-2 self-start sm:self-center shrink-0"
                            >
                              Já retirei o pacote → Mudar para Entrega
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Map + Sequential Stops List */}
                      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
                        <div className="lg:col-span-5 space-y-3">
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
                            heightClass="h-[260px] lg:h-[340px]"
                            title={`Rota ${order.code} · Porto Alegre`}
                          />

                          {/* Native GPS App Navigation Shortcuts */}
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50/90 p-3.5 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900">
                                <Navigation
                                  className="h-3.5 w-3.5 text-emerald-600"
                                  aria-hidden="true"
                                />
                                Navegação GPS
                              </span>
                              <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[11px] font-semibold">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGpsStageByOrder((prev) => ({
                                      ...prev,
                                      [order.id]: 'pickup',
                                    }))
                                  }
                                  className={`rounded-md px-2.5 py-1 transition-colors ${
                                    gpsStage === 'pickup'
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-zinc-600 hover:text-zinc-900'
                                  }`}
                                >
                                  Ir para Coleta
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGpsStageByOrder((prev) => ({
                                      ...prev,
                                      [order.id]: 'delivery',
                                    }))
                                  }
                                  className={`rounded-md px-2.5 py-1 transition-colors ${
                                    gpsStage === 'delivery'
                                      ? 'bg-orange-600 text-white'
                                      : 'text-zinc-600 hover:text-zinc-900'
                                  }`}
                                >
                                  {order.stops.length > 1 && nextPendingStop
                                    ? `Ir para Entrega #${nextPendingStop.sequence}`
                                    : 'Ir para Entrega'}
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-zinc-600 leading-snug">
                              <span className="font-semibold text-zinc-800">
                                {gpsTarget.label}:
                              </span>{' '}
                              {gpsTarget.address} — Bairro{' '}
                              {gpsTarget.neighborhood}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <a
                                href={googleMapsNavUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 shadow-xs"
                              >
                                <MapPin
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden="true"
                                />
                                <span>Abrir no Google Maps</span>
                                <ExternalLink
                                  className="h-3.5 w-3.5 shrink-0 opacity-85"
                                  aria-hidden="true"
                                />
                              </a>

                              <a
                                href={wazeNavUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-sky-600 bg-sky-600 px-3.5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-700 shadow-xs"
                              >
                                <Navigation
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden="true"
                                />
                                <span>Abrir no Waze</span>
                                <ExternalLink
                                  className="h-3.5 w-3.5 shrink-0 opacity-85"
                                  aria-hidden="true"
                                />
                              </a>
                            </div>
                          </div>
                        </div>

                        <div className="lg:col-span-7 space-y-3">
                          {order.stops.map((stop) => {
                            const isConfirming = confirmingStopId === stop.id;
                            const gpsUrl = buildGoogleMapsStopUrl(stop);
                            const attachedPhoto = photoInputs[stop.id];
                            const isCompressing = compressingStopId === stop.id;

                            return (
                              <div
                                key={stop.id}
                                className={`rounded-xl border p-4 space-y-3 ${
                                  stop.delivered
                                    ? 'border-emerald-200 bg-emerald-50/40'
                                    : 'border-zinc-200 bg-zinc-50/70'
                                }`}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 font-mono text-xs font-bold text-white">
                                        {stop.sequence}
                                      </span>
                                      {order.type === 'rota' && (
                                        <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-zinc-900">
                                          {stop.pickupCode || formatPickupCode(stop.id)}
                                        </span>
                                      )}
                                      <span className="text-sm font-semibold text-zinc-900">
                                        {stop.address}
                                      </span>
                                    </div>
                                    <p className="text-xs text-zinc-600">
                                      Bairro {stop.neighborhood}
                                      {stop.expectedRecipient
                                        ? ` · Recebedor previsto: ${stop.expectedRecipient}`
                                        : ''}
                                    </p>
                                    {stop.recipientNote && (
                                      <p className="text-xs text-zinc-500">
                                        Obs: {stop.recipientNote}
                                      </p>
                                    )}
                                    {stop.delivered && stop.receiverName && (
                                      <div className="pt-1 space-y-1.5">
                                        <p className="text-xs font-semibold text-emerald-800">
                                          Entregue para {stop.receiverName}
                                          {stop.deliveredAt
                                            ? ` · ${formatDateTimeBR(stop.deliveredAt)}`
                                            : ''}
                                        </p>
                                        {stop.proofPhotoDataUrl && (
                                          <div className="flex items-center gap-2">
                                            <img
                                              src={stop.proofPhotoDataUrl}
                                              alt={`Comprovante parada ${stop.sequence}`}
                                              className="h-12 w-16 rounded border border-emerald-200 object-cover"
                                            />
                                            <span className="text-[11px] text-emerald-700 font-medium">
                                              Foto comprovante salva
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {stop.delivered ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 whitespace-nowrap shrink-0">
                                      <CheckCircle2
                                        className="h-3.5 w-3.5 text-emerald-600"
                                        aria-hidden="true"
                                      />
                                      <span>Entregue</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 whitespace-nowrap shrink-0">
                                      <Clock
                                        className="h-3.5 w-3.5 text-amber-600"
                                        aria-hidden="true"
                                      />
                                      <span>Pendente</span>
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                  <a
                                    href={gpsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 whitespace-nowrap"
                                  >
                                    <Navigation
                                      className="h-4 w-4 text-emerald-600"
                                      aria-hidden="true"
                                    />
                                    <span>Abrir no GPS / Maps</span>
                                    <ExternalLink
                                      className="h-3 w-3 text-zinc-400"
                                      aria-hidden="true"
                                    />
                                  </a>

                                  {!stop.delivered && !isConfirming && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenConfirmForm(stop.id)}
                                      className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                                    >
                                      <UserCheck
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                      <span>Confirmar Entrega + Foto</span>
                                    </button>
                                  )}
                                </div>

                                {!stop.delivered && isConfirming && (
                                  <div className="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-3">
                                    <div>
                                      <label
                                        htmlFor={`receiver-input-${stop.id}`}
                                        className="block text-xs font-semibold text-zinc-800 mb-1.5"
                                      >
                                        Quem recebeu esta entrega?
                                      </label>
                                      <input
                                        id={`receiver-input-${stop.id}`}
                                        type="text"
                                        autoFocus
                                        value={receiverInputs[stop.id] || ''}
                                        onChange={(e) =>
                                          setReceiverInputs((prev) => ({
                                            ...prev,
                                            [stop.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Ex: Marcos / Portaria"
                                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                                      />
                                      {stop.expectedRecipient && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setReceiverInputs((prev) => ({
                                              ...prev,
                                              [stop.id]:
                                                stop.expectedRecipient || '',
                                            }))
                                          }
                                          className="mt-1.5 text-xs font-medium text-emerald-700 hover:underline"
                                        >
                                          Usar recebedor previsto:{' '}
                                          {stop.expectedRecipient}
                                        </button>
                                      )}
                                    </div>

                                    <div className="space-y-2 border-t border-zinc-100 pt-2.5">
                                      <span className="block text-xs font-semibold text-zinc-800">
                                        Foto do Comprovante (câmera ou arquivo)
                                      </span>

                                      <div className="flex flex-wrap items-center gap-3">
                                        <label
                                          htmlFor={`photo-input-${stop.id}`}
                                          className="min-h-[44px] inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-100"
                                        >
                                          <Camera
                                            className="h-4 w-4 text-emerald-600"
                                            aria-hidden="true"
                                          />
                                          <span>
                                            {isCompressing
                                              ? 'Comprimindo foto...'
                                              : attachedPhoto
                                              ? 'Trocar Foto'
                                              : 'Tirar ou Anexar Foto'}
                                          </span>
                                          <input
                                            id={`photo-input-${stop.id}`}
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="sr-only"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              void handlePhotoSelected(stop.id, file);
                                              e.target.value = '';
                                            }}
                                          />
                                        </label>

                                        {attachedPhoto && (
                                          <div className="flex items-center gap-2">
                                            <img
                                              src={attachedPhoto}
                                              alt="Prévia do comprovante"
                                              className="h-12 w-16 rounded-md border border-zinc-300 object-cover"
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleRemovePhoto(stop.id)
                                              }
                                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                            >
                                              <Trash2
                                                className="h-3.5 w-3.5"
                                                aria-hidden="true"
                                              />
                                              <span>Remover</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {stopErrors[stop.id] && (
                                      <p className="text-xs text-red-600 font-medium">
                                        {stopErrors[stop.id]}
                                      </p>
                                    )}

                                    <div className="flex items-center gap-2 pt-1">
                                      <button
                                        type="button"
                                        disabled={isCompressing}
                                        onClick={() =>
                                          void handleStopConfirmSubmit(
                                            order.id,
                                            stop.id
                                          )
                                        }
                                        className="min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                                      >
                                        Salvar Confirmação
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmingStopId(null)}
                                        className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 whitespace-nowrap"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-zinc-100 pt-4">
                        <p className="text-xs text-zinc-600">
                          {allStopsDelivered ? (
                            <span className="font-semibold text-emerald-800">
                              Todas as {order.stops.length} paradas concluídas!
                              Finalize a corrida para registrar a entrega.
                            </span>
                          ) : (
                            <span>
                              Conclua todas as paradas ({deliveredCount}/
                              {order.stops.length}) para liberar a finalização.
                            </span>
                          )}
                        </p>

                        <button
                          type="button"
                          disabled={!allStopsDelivered}
                          onClick={() => void onCompleteOrder(order.id)}
                          className={`min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                            allStopsDelivered
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400'
                          }`}
                        >
                          <Flag className="h-4 w-4" aria-hidden="true" />
                          <span>Finalizar Entrega</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Available Compatible Offers List */}
          <section className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-zinc-900">
                  Ofertas Disponíveis em Porto Alegre
                </h2>
                <p className="text-xs text-zinc-500">
                  Filtradas para {activeCourier.vehicleType || 'seu veículo'}
                  {isBike
                    ? ` · Raio ${
                        effectiveBikeRadius === null
                          ? 'Sem limite'
                          : `até ${effectiveBikeRadius} km`
                      }`
                    : ''}
                  {hiddenIncompatibleCount > 0
                    ? ` · ${hiddenIncompatibleCount} incompatível(is) oculta(s)`
                    : ''}
                </p>
              </div>
              <span className="font-mono text-xs font-semibold text-zinc-600 tabular-nums">
                {compatibleAvailableOrders.length} oferta(s)
              </span>
            </div>

            {compatibleAvailableOrders.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-8 sm:p-10 text-center space-y-2">
                <p className="text-sm font-semibold text-zinc-900">
                  Nenhuma oferta disponível para {activeCourier.vehicleType} no
                  momento.
                </p>
                <p className="text-xs text-zinc-600 max-w-md mx-auto leading-relaxed">
                  {activeCourier.isOnline
                    ? 'Você está ONLINE: assim que um lojista ou cliente publicar uma entrega compatível em Porto Alegre, você ouvirá o alerta "RotaJusta!".'
                    : 'Fique ONLINE no botão acima para receber alertas sonoros assim que surgir uma nova oferta.'}
                </p>
                {isBike &&
                  effectiveBikeRadius !== null &&
                  exceededBikeRadiusCount > 0 && (
                    <p className="text-xs text-emerald-700 font-medium pt-1">
                      Há {exceededBikeRadiusCount} entrega(s) acima de{' '}
                      {effectiveBikeRadius} km. Ajuste seu raio na aba Meu Perfil.
                    </p>
                  )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {compatibleAvailableOrders.map((order) => {
                  const settlement = getCourierSettlementForOrder(
                    order,
                    activeCourier.propulsion || 'Combustão'
                  );
                  const isMapOpen = previewMapOrderId === order.id;
                  const isHighlightedUtilityFreight =
                    activeCourier.vehicleType === 'Utilitário / Picape / Van' &&
                    order.type === 'frete';
                  const scheduleLabel = formatPickupScheduleLabel(
                    order.pickupSchedule
                  );

                  return (
                    <article
                      key={order.id}
                      className={`flex flex-col justify-between rounded-2xl border p-4 sm:p-5 space-y-4 ${
                        isHighlightedUtilityFreight
                          ? 'border-amber-300 bg-amber-50/15'
                          : 'border-zinc-200 bg-white'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Top row: Code + Type/Distance + Net Payout */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span className="font-mono font-bold text-zinc-900">
                                {order.code}
                              </span>
                              <span aria-hidden="true">·</span>
                              {order.type === 'frete' ? (
                                <FreightBadge compact />
                              ) : (
                                <span className="inline-flex items-center gap-1 font-medium text-zinc-700">
                                  {order.type === 'rapida' ? (
                                    <MapPin
                                      className="h-3.5 w-3.5 text-emerald-600"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Package
                                      className="h-3.5 w-3.5 text-emerald-600"
                                      aria-hidden="true"
                                    />
                                  )}
                                  {order.type === 'rapida'
                                    ? `Entrega Rápida${
                                        order.distanceKm !== undefined
                                          ? ` · ${order.distanceKm.toLocaleString('pt-BR')} km`
                                          : ''
                                      }`
                                    : `Rota (${order.packageCount} pacotes)`}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                              <span>{order.merchantName}</span>
                              <RatingBadge
                                avg={order.merchantRatingAvg}
                                count={order.merchantRatingCount}
                                compact
                              />
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-medium text-zinc-500">
                              Valor líquido
                            </p>
                            <p className="font-mono text-xl font-bold text-emerald-700 tabular-nums">
                              {formatBRL(settlement.netPayout)}
                            </p>
                          </div>
                        </div>

                        {scheduleLabel && (
                          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
                            <CalendarClock
                              className="h-4 w-4 text-amber-700 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{scheduleLabel}</span>
                          </div>
                        )}

                        {/* Pickup & Destination */}
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-1.5">
                          <h3 className="font-display text-base font-bold text-zinc-900">
                            {order.pickupNeighborhood} →{' '}
                            {order.destinationNeighborhood}
                          </h3>
                          <p className="text-xs text-zinc-600">
                            Coleta: {order.pickupAddress} (
                            {order.pickupNeighborhood})
                          </p>
                          <p className="text-xs text-zinc-500">
                            {order.stops.length} parada(s) ·{' '}
                            {order.distanceKm !== undefined
                              ? `${order.distanceKm.toLocaleString('pt-BR')} km estimados`
                              : `${order.packageCount} pacote(s)`}{' '}
                            · {formatPaymentMethodLabel(order.paymentMethod)}
                          </p>
                          {order.flowDirection === 'receber' && (
                            <p className="text-[11px] font-medium text-sky-800">
                              Retirada em terceiros · Entrega ao solicitante
                            </p>
                          )}
                        </div>

                        {order.type === 'frete' && order.freightDetails && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-1 text-xs">
                            <p className="font-semibold text-zinc-900">
                              Carga: {order.freightDetails.cargoDescription}
                            </p>
                            <p className="text-zinc-700">
                              Porte:{' '}
                              <strong>
                                {order.freightDetails.cargoSize === 'grande'
                                  ? 'Grande/Volumoso'
                                  : 'Médio'}
                              </strong>{' '}
                              ·{' '}
                              {order.freightDetails.includeHelper
                                ? 'Com ajudante (+R$ 40,00)'
                                : 'Sem ajudante'}{' '}
                              · Acesso: {order.freightDetails.accessNote}
                            </p>
                          </div>
                        )}

                        {isMapOpen && (
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
                            heightClass="h-[230px]"
                            title={`Prévia ${order.code}`}
                          />
                        )}
                      </div>

                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-1">
                        <div className="flex items-center justify-between sm:justify-start gap-2">
                          {isZeroFee ? (
                            <EvBadge
                              compact
                              propulsion={activeCourier.propulsion}
                            />
                          ) : (
                            <span className="text-xs text-zinc-500 font-mono tabular-nums">
                              Taxa app: {formatBRL(settlement.platformFee)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewMapOrderId(isMapOpen ? null : order.id)
                            }
                            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            <MapIcon
                              className="h-3.5 w-3.5 text-emerald-600"
                              aria-hidden="true"
                            />
                            <span>
                              {isMapOpen ? 'Ocultar Mapa' : 'Ver no Mapa'}
                            </span>
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={acceptingOrderId === order.id}
                          onClick={() => void handleAcceptClick(order.id)}
                          className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          <Truck className="h-4 w-4" aria-hidden="true" />
                          <span>
                            {acceptingOrderId === order.id
                              ? 'Aceitando...'
                              : 'Aceitar Corrida'}
                          </span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: 💰 FINANCEIRO & GANHOS                                         */}
      {/* ===================================================================== */}
      {activeTab === 'financeiro' && (
        <div className="space-y-6">
          {/* Earnings Summary: Hoje, Semana, Total Acumulado */}
          <section className="space-y-3">
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-900">
                Financeiro & Ganhos
              </h1>
              <p className="text-xs text-zinc-500">
                Resumo das entregas concluídas, gestão da sua Chave Pix e
                conferência de recebimentos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-xs font-medium text-zinc-500">Ganhos Hoje</p>
                <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                  {formatBRL(earningsSummary.completedTodayNet)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {earningsSummary.completedTodayCount} corrida(s) concluída(s)
                  hoje
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-xs font-medium text-zinc-500">
                  Ganhos na Semana (7 dias)
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                  {formatBRL(earningsSummary.completedWeekNet)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {earningsSummary.completedWeekCount} corrida(s) nos últimos 7
                  dias
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
                <p className="text-xs font-medium text-emerald-900">
                  Total Acumulado
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                  {formatBRL(earningsSummary.completedNet)}
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  {earningsSummary.completedCount} entrega(s) · Economia Taxa
                  Zero:{' '}
                  <strong className="font-mono">
                    {formatBRL(earningsSummary.completedEvBonus)}
                  </strong>
                </p>
              </div>
            </div>
          </section>

          {/* Pix Status Overview + Quick Pix Key Editor */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Pix Payment Status Breakdown */}
            <div className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
                <Wallet
                  className="h-4 w-4 text-emerald-700 shrink-0"
                  aria-hidden="true"
                />
                <h2 className="font-display text-base font-bold text-zinc-900">
                  Status dos Pagamentos Pix
                </h2>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-emerald-900">
                      Pago / Confirmado
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      {earningsSummary.confirmedPixCount} corrida(s) com Pix
                      confirmado
                    </p>
                  </div>
                  <p className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                    {formatBRL(earningsSummary.confirmedPixAmount)}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-amber-900">
                      Aguardando Confirmação do Lojista
                    </p>
                    <p className="text-[11px] text-amber-800">
                      {earningsSummary.awaitingMerchantPixCount} corrida(s)
                      pendente(s)
                    </p>
                  </div>
                  <p className="font-mono text-base font-bold text-amber-800 tabular-nums">
                    {formatBRL(earningsSummary.awaitingMerchantPixAmount)}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Pix Key Management */}
            <form
              onSubmit={handleSavePixKey}
              className="lg:col-span-7 rounded-2xl border border-zinc-200 bg-white p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <QrCode
                    className="h-4 w-4 text-emerald-700 shrink-0"
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-base font-bold text-zinc-900">
                    Minha Chave Pix (Recebimento Direto)
                  </h2>
                </div>
                {activeCourier.pixKey ? (
                  <span className="text-xs font-medium text-emerald-700">
                    Cadastrada
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-700">
                    Pendente
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <label
                    htmlFor="courier-pix-type"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Tipo de Chave
                  </label>
                  <select
                    id="courier-pix-type"
                    value={pixTypeDraft}
                    onChange={(e) =>
                      setPixTypeDraft(e.target.value as PixKeyType)
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-xs font-medium text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {PIX_KEY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-8">
                  <label
                    htmlFor="courier-pix-value"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Chave Pix
                  </label>
                  <input
                    id="courier-pix-value"
                    type="text"
                    value={pixKeyDraft}
                    onChange={(e) => {
                      setPixKeyDraft(e.target.value);
                      setPixFeedback(null);
                    }}
                    placeholder={getPixKeyPlaceholder(pixTypeDraft)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-mono text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">
                  {pixFeedback ? (
                    <span className="font-semibold text-emerald-700">
                      {pixFeedback}
                    </span>
                  ) : (
                    'O lojista copia sua Chave Pix automaticamente ao aceitar uma corrida.'
                  )}
                </p>
                <button
                  type="submit"
                  disabled={isSavingPix}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {isSavingPix ? 'Salvando...' : 'Salvar Chave Pix'}
                  </span>
                </button>
              </div>
            </form>
          </section>

          {/* Detailed Completed Rides Statement + Pix Confirmation + Rating */}
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-zinc-900">
                  Extrato das Corridas Concluídas
                </h2>
                <p className="text-xs text-zinc-500">
                  Confirme o recebimento do Pix e avalie o solicitante após cada
                  entrega.
                </p>
              </div>

              <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1">
                {(
                  [
                    { id: 'todas', label: 'Todas' },
                    { id: 'confirmadas', label: 'Confirmadas' },
                    { id: 'pendentes', label: 'Aguardando' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPixFilter(item.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      pixFilter === item.id
                        ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCompletedOrders.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center space-y-2">
                <Wallet
                  className="mx-auto h-8 w-8 text-emerald-600"
                  aria-hidden="true"
                />
                <p className="text-sm font-semibold text-zinc-900">
                  Nenhuma corrida concluída encontrada neste filtro.
                </p>
                <p className="text-xs text-zinc-500">
                  Assim que você finalizar corridas na aba Ofertas & Em Rota, o
                  extrato aparecerá aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                {filteredCompletedOrders.map((order) => {
                  const existingRating = ratings.find(
                    (r) =>
                      r.deliveryId === order.id &&
                      r.fromProfileId === activeCourier.id
                  );
                  const netValue = order.netCourierPayout ?? order.basePayout;
                  const evBonus = order.evBonusApplied ?? 0;
                  const isConfirmedByCourier =
                    order.paymentStatus === 'repassado';
                  const isPaidByMerchant =
                    order.paymentStatus === 'pago_lojista';

                  return (
                    <div key={order.id} className="p-4 sm:p-5 space-y-3 text-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-zinc-900">
                              {order.code}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300">
                              ·
                            </span>
                            {order.type === 'frete' && <FreightBadge compact />}
                            <span className="font-semibold text-zinc-900">
                              {order.pickupNeighborhood} →{' '}
                              {order.destinationNeighborhood}
                            </span>
                            <span className="text-xs text-zinc-500">
                              · {order.merchantName}
                            </span>
                            <RatingBadge
                              avg={order.merchantRatingAvg}
                              count={order.merchantRatingCount}
                              compact
                            />
                          </div>

                          <p className="text-xs text-zinc-500">
                            {formatDateTimeBR(
                              order.completedAt || order.createdAt
                            )}{' '}
                            · {order.stops.length} parada(s) ·{' '}
                            {formatPaymentMethodLabel(order.paymentMethod)}
                          </p>
                        </div>

                        <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {evBonus > 0 && (
                              <EvBadge
                                compact
                                propulsion={activeCourier.propulsion}
                              />
                            )}
                            <span className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                              +{formatBRL(netValue)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {isConfirmedByCourier ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                <CheckCircle2
                                  className="h-3.5 w-3.5 text-emerald-600"
                                  aria-hidden="true"
                                />
                                <span>Pago / Confirmado</span>
                              </span>
                            ) : isPaidByMerchant ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                                <QrCode
                                  className="h-3.5 w-3.5 text-sky-600"
                                  aria-hidden="true"
                                />
                                <span>Enviado pelo Lojista</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                <Clock
                                  className="h-3.5 w-3.5 text-amber-600"
                                  aria-hidden="true"
                                />
                                <span>Aguardando Confirmação do Lojista</span>
                              </span>
                            )}

                            {!isConfirmedByCourier && (
                              <button
                                type="button"
                                disabled={
                                  confirmingReceiptOrderId === order.id
                                }
                                onClick={() =>
                                  void handleConfirmReceiptClick(order.id)
                                }
                                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>
                                  {confirmingReceiptOrderId === order.id
                                    ? 'Confirmando...'
                                    : 'Confirmar Recebimento Pix'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <OrderRatingBox
                        buttonLabel="Avaliar Solicitante / Lojista"
                        targetName={order.merchantName}
                        commentPlaceholder="Comentário opcional: agilidade na coleta, clareza de endereço e pagamento..."
                        existingRating={existingRating}
                        canRate={Boolean(
                          order.merchantId &&
                            order.merchantId !== 'lojista-supabase' &&
                            order.merchantId !== activeCourier.id
                        )}
                        unavailableNote="Pedido sem ID de solicitante vinculado para avaliação."
                        onSubmit={async (stars, comment) => {
                          if (!order.merchantId) return;
                          await onSubmitRating({
                            deliveryId: order.id,
                            fromProfileId: activeCourier.id,
                            toProfileId: order.merchantId,
                            stars,
                            comment,
                          });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: 👤 MEU PERFIL & VEÍCULO                                        */}
      {/* ===================================================================== */}
      {activeTab === 'perfil' && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-zinc-900">
              Meu Perfil & Veículo
            </h1>
            <p className="text-xs text-zinc-500">
              Dados cadastrais validados, reputação com estrelas, propulsão e
              configurações operacionais.
            </p>
          </div>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-start gap-3.5">
                <CourierAvatar
                  name={activeCourier.name}
                  avatarUrl={activeCourier.avatarUrl}
                  size="lg"
                />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-zinc-900">
                      {activeCourier.name}
                    </h2>
                    <RatingBadge
                      avg={activeCourier.ratingAvg}
                      count={activeCourier.ratingCount}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ApprovalStatusBadge status={activeCourier.approvalStatus} />
                    <PropulsionTag propulsion={activeCourier.propulsion} />
                    {activeCourier.vehicleType === 'Bike' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <Bike className="h-3 w-3" aria-hidden="true" />
                        <span>Bicicleta</span>
                      </span>
                    ) : (
                      activeCourier.plate && (
                        <VehiclePlateBadge plate={activeCourier.plate} compact />
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-1">
                <p className="text-zinc-500">CPF Validado</p>
                <p className="font-mono text-sm font-semibold text-zinc-900 tabular-nums flex items-center gap-1.5">
                  <ShieldCheck
                    className="h-4 w-4 text-emerald-600 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {formatCpfOrCnpj(
                      activeCourier.documentNumber || activeCourier.document,
                      'PF'
                    ) || 'Não informado'}
                  </span>
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-1">
                <p className="text-zinc-500">Telefone de Acesso</p>
                <p className="font-mono text-sm font-semibold text-zinc-900">
                  {activeCourier.phone || 'Não informado'}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-1">
                <p className="text-zinc-500">E-mail</p>
                <p className="text-sm font-medium text-zinc-900 truncate">
                  {activeCourier.email || 'Não informado'}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-1.5">
                <p className="text-zinc-500">Veículo & Identificação</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {activeCourier.vehicleType || 'Não definido'}
                  {formatVehicleModelAndColor(
                    activeCourier.vehicleModel,
                    activeCourier.vehicleColor
                  )
                    ? ` · ${formatVehicleModelAndColor(
                        activeCourier.vehicleModel,
                        activeCourier.vehicleColor
                      )}`
                    : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {activeCourier.vehicleType !== 'Bike' && (
                    <VehiclePlateBadge plate={activeCourier.plate} compact />
                  )}
                  <span className="text-[11px] text-zinc-500">
                    Compatível: {getVehicleCompatibilityLabel(activeCourier.vehicleType)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-1">
                <p className="text-zinc-500">Propulsão & Taxa</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {activeCourier.propulsion || 'Combustão'}
                </p>
                <p className="text-[11px] text-emerald-700 font-medium">
                  {isZeroFee
                    ? 'Taxa zero (R$ 0,00) + Bônus 100% EV'
                    : 'Taxa fixa padrão aplicada'}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-1">
                <p className="text-zinc-500">CNH com EAR / Cidade Base</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {activeCourier.hasEar ? 'CNH EAR Verificada' : 'Sem EAR informado'}{' '}
                  · {activeCourier.neighborhood}
                </p>
              </div>
            </div>

            {/* Editor de Identificação Visual & Veículo (Foto, Modelo/Cor e Placa) */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIdentityError(null);
                setIdentityFeedback(null);

                if (!vehicleModelDraft.trim() || !vehicleColorDraft.trim()) {
                  setIdentityError(
                    'Informe o modelo e a cor do veículo para exibição segura aos clientes.'
                  );
                  return;
                }
                if (
                  vehicleTypeDraft !== 'Bike' &&
                  !isValidBrazilianPlate(plateDraft)
                ) {
                  setIdentityError(
                    'Informe uma placa válida (ex.: ABC1D23 ou ABC1234).'
                  );
                  return;
                }

                setIsSavingIdentity(true);
                try {
                  const updated = await updateCourierIdentityInSupabase({
                    profileId: activeCourier.id,
                    avatarUrl: avatarDraft.trim() || null,
                    vehicleType: vehicleTypeDraft,
                    propulsion: propulsionDraft,
                    vehicleModel: vehicleModelDraft.trim(),
                    vehicleColor: vehicleColorDraft.trim(),
                    plate:
                      vehicleTypeDraft === 'Bike'
                        ? plateDraft.trim().toUpperCase() || undefined
                        : plateDraft.trim().toUpperCase(),
                  });
                  onCourierProfileUpdated?.(updated);
                  setIdentityFeedback(
                    'Foto, veículo e placa salvos! Os clientes já verão sua identificação nas corridas.'
                  );
                } catch (err) {
                  setIdentityError(
                    err instanceof Error
                      ? err.message
                      : 'Erro ao atualizar identificação do entregador.'
                  );
                } finally {
                  setIsSavingIdentity(false);
                }
              }}
              className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-4"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Foto de Segurança, Veículo e Placa
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Exibido para o cliente na coleta e na entrega para evitar fraudes.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <CourierAvatar
                  name={activeCourier.name}
                  avatarUrl={avatarDraft || undefined}
                  size="lg"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                    <Camera className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span>
                      {isCompressingAvatar
                        ? 'Processando...'
                        : avatarDraft
                        ? 'Trocar Foto'
                        : 'Enviar Foto'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="sr-only"
                      disabled={isCompressingAvatar}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setIdentityError(null);
                        setIsCompressingAvatar(true);
                        try {
                          const dataUrl = await compressImageToJpeg(file, 280, 0.72);
                          setAvatarDraft(dataUrl);
                        } catch {
                          setIdentityError('Não foi possível processar esta foto.');
                        } finally {
                          setIsCompressingAvatar(false);
                        }
                      }}
                    />
                  </label>
                  {avatarDraft && (
                    <button
                      type="button"
                      onClick={() => setAvatarDraft('')}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Remover Foto</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label
                    htmlFor="courier-tab-vehicle-type"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Categoria
                  </label>
                  <select
                    id="courier-tab-vehicle-type"
                    value={vehicleTypeDraft}
                    onChange={(e) => {
                      const next = e.target.value as VehicleType;
                      setVehicleTypeDraft(next);
                      const allowed = getPropulsionOptionsForVehicle(next);
                      if (!allowed.includes(propulsionDraft)) {
                        setPropulsionDraft(allowed[0]);
                      }
                      if (next === 'Bike') {
                        setPlateDraft('');
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {VEHICLE_CATEGORIES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="courier-tab-propulsion"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Propulsão
                  </label>
                  <select
                    id="courier-tab-propulsion"
                    value={propulsionDraft}
                    onChange={(e) =>
                      setPropulsionDraft(e.target.value as PropulsionType)
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {getPropulsionOptionsForVehicle(vehicleTypeDraft).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="courier-tab-plate"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Placa {vehicleTypeDraft === 'Bike' ? '(Opcional)' : '*'}
                  </label>
                  <input
                    id="courier-tab-plate"
                    type="text"
                    value={plateDraft}
                    disabled={vehicleTypeDraft === 'Bike'}
                    onChange={(e) =>
                      setPlateDraft(formatPlateInput(e.target.value))
                    }
                    placeholder={
                      vehicleTypeDraft === 'Bike' ? 'Não exigida' : 'ABC1D23'
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs uppercase text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-500"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-2">
                  <label
                    htmlFor="courier-tab-model"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Modelo do Veículo *
                  </label>
                  <input
                    id="courier-tab-model"
                    type="text"
                    value={vehicleModelDraft}
                    onChange={(e) => setVehicleModelDraft(e.target.value)}
                    placeholder="Ex: Honda CG 160 / Caloi Aro 29 / Fiat Fiorino"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="courier-tab-color"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Cor *
                  </label>
                  <input
                    id="courier-tab-color"
                    type="text"
                    value={vehicleColorDraft}
                    onChange={(e) => setVehicleColorDraft(e.target.value)}
                    placeholder="Ex: Preta"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {identityError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {identityError}
                </p>
              )}

              {identityFeedback && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  {identityFeedback}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingIdentity || isCompressingAvatar}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSavingIdentity
                    ? 'Salvando...'
                    : 'Salvar Foto, Veículo e Placa'}
                </button>
              </div>
            </form>

            {/* Bike Max Radius Setting */}
            {isBike && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-zinc-900">
                    Raio Máximo de Atendimento (Bike)
                  </h3>
                  <p className="text-xs text-zinc-600">
                    Escolha a distância máxima das entregas rápidas exibidas no seu
                    mural conforme o ritmo do dia.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {BIKE_RADIUS_OPTIONS.map((opt) => {
                    const isActive =
                      (activeCourier.bikeMaxRadiusKm === undefined
                        ? 3
                        : activeCourier.bikeMaxRadiusKm) === opt.value;
                    return (
                      <button
                        key={opt.shortLabel}
                        type="button"
                        onClick={() =>
                          void onUpdateBikeRadius(activeCourier.id, opt.value)
                        }
                        className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          isActive
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        {opt.fullLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Zero-Fee Clean Mobility Summary */}
            {isZeroFee && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950">
                <Zap
                  className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>
                  <strong>Incentivo à Mobilidade Limpa ativo:</strong> sua taxa da
                  plataforma é <strong>R$ 0,00</strong> e 100% da taxa do app é
                  revertida diretamente no seu ganho líquido em Porto Alegre.
                </span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* FIXED MOBILE BOTTOM TAB BAR (THUMB-ZONE NAVIGATION)                   */}
      {/* ===================================================================== */}
      <nav
        aria-label="Menu inferior do entregador"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      >
        <div className="grid grid-cols-3 h-16 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('ofertas')}
            className={`relative flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] px-2 transition-colors ${
              activeTab === 'ofertas'
                ? 'text-emerald-700 font-bold'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <Truck className="h-5 w-5" aria-hidden="true" />
              {offersBadgeCount > 0 && (
                <span className="absolute -right-3 -top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] font-bold text-white tabular-nums">
                  {offersBadgeCount}
                </span>
              )}
            </div>
            <span className="text-[11px] leading-tight whitespace-nowrap">
              Ofertas
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('financeiro')}
            className={`relative flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] px-2 transition-colors ${
              activeTab === 'financeiro'
                ? 'text-emerald-700 font-bold'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <Wallet className="h-5 w-5" aria-hidden="true" />
              {earningsSummary.unconfirmedReceiptCount > 0 && (
                <span className="absolute -right-3 -top-1.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white tabular-nums">
                  {earningsSummary.unconfirmedReceiptCount}
                </span>
              )}
            </div>
            <span className="text-[11px] leading-tight whitespace-nowrap">
              Financeiro
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('perfil')}
            className={`relative flex flex-col items-center justify-center gap-0.5 h-full min-h-[44px] px-2 transition-colors ${
              activeTab === 'perfil'
                ? 'text-emerald-700 font-bold'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <User className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] leading-tight whitespace-nowrap">
              Meu Perfil
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
