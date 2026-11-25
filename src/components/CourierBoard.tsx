import { useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Map as MapIcon,
  MapPin,
  Navigation,
  Package,
  QrCode,
  Trash2,
  Truck,
  UserCheck,
  Zap,
} from 'lucide-react';
import { buildGoogleMapsStopUrl } from '../constants/portoAlegre';
import { Order, Profile } from '../types';
import { compressImageToJpeg } from '../utils/imageCompression';
import { formatPaymentMethodLabel } from '../utils/pix';
import {
  formatBRL,
  formatDateTimeBR,
  getCourierSettlementForOrder,
  isZeroFeePropulsion,
} from '../utils/pricing';
import {
  BIKE_RADIUS_OPTIONS,
  getEffectiveBikeRadiusKm,
  getVehicleCompatibilityLabel,
  sortCompatibleOrdersForVehicle,
} from '../utils/vehicleCompatibility';
import {
  EvBadge,
  FreightBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PropulsionTag,
} from './EvBadge';
import { PortoAlegreMap } from './PortoAlegreMap';

interface CourierBoardProps {
  lockedCourier?: Profile;
  approvedCouriers: Profile[];
  pendingCouriersCount: number;
  waitingOrders: Order[];
  orders: Order[];
  activeCourierId: string;
  onSelectCourier: (id: string) => void;
  onAcceptOrder: (orderId: string, courier: Profile) => Promise<void>;
  onConfirmStop: (
    orderId: string,
    stopId: string,
    receiverName: string,
    proofPhotoDataUrl?: string
  ) => Promise<void>;
  onCompleteOrder: (orderId: string) => Promise<void>;
  onUpdateBikeRadius: (courierId: string, radiusKm: number | null) => Promise<void>;
}

export function CourierBoard({
  lockedCourier,
  approvedCouriers,
  pendingCouriersCount,
  waitingOrders,
  orders,
  activeCourierId,
  onSelectCourier,
  onAcceptOrder,
  onConfirmStop,
  onCompleteOrder,
  onUpdateBikeRadius,
}: CourierBoardProps) {
  const activeCourier = useMemo(() => {
    if (lockedCourier) return lockedCourier;
    return (
      approvedCouriers.find((c) => c.id === activeCourierId) ??
      approvedCouriers[0]
    );
  }, [lockedCourier, approvedCouriers, activeCourierId]);

  const [confirmingStopId, setConfirmingStopId] = useState<string | null>(null);
  const [receiverInputs, setReceiverInputs] = useState<Record<string, string>>({});
  const [photoInputs, setPhotoInputs] = useState<Record<string, string>>({});
  const [compressingStopId, setCompressingStopId] = useState<string | null>(null);
  const [stopErrors, setStopErrors] = useState<Record<string, string>>({});
  const [previewMapOrderId, setPreviewMapOrderId] = useState<string | null>(null);

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
    const isSameLocalDay = (iso?: string) => {
      if (!iso) return false;
      const d = new Date(iso);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    };

    const completedToday = myCompletedOrders.filter((ord) =>
      isSameLocalDay(ord.completedAt || ord.createdAt)
    );
    const completedTodayNet = completedToday.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );

    const completedNet = myCompletedOrders.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );

    const completedEvBonus = [...myCompletedOrders, ...myActiveOrders].reduce(
      (acc, ord) => acc + (ord.evBonusApplied ?? 0),
      0
    );

    const inRouteProjected = myActiveOrders.reduce(
      (acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout),
      0
    );

    const pendingCompletedReceivable = myCompletedOrders
      .filter((ord) => {
        if (ord.paymentMethod === 'pix_plataforma') {
          return ord.paymentStatus !== 'repassado';
        }
        return !ord.paymentStatus || ord.paymentStatus === 'pendente_pagamento';
      })
      .reduce((acc, ord) => acc + (ord.netCourierPayout ?? ord.basePayout), 0);

    const totalReceivablePending = Number(
      (inRouteProjected + pendingCompletedReceivable).toFixed(2)
    );

    return {
      completedTodayCount: completedToday.length,
      completedTodayNet,
      completedCount: myCompletedOrders.length,
      completedNet,
      completedEvBonus,
      inRouteCount: myActiveOrders.length,
      totalReceivablePending,
    };
  }, [myCompletedOrders, myActiveOrders]);

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

  if (!activeCourier) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center space-y-2">
        <h2 className="font-display text-lg font-semibold text-zinc-900">
          Nenhum entregador aprovado ativo
        </h2>
        <p className="text-sm text-zinc-600 max-w-md mx-auto">
          Cadastre um entregador na aba &ldquo;Cadastro e Perfis&rdquo; e aprove-o na aba
          &ldquo;Admin (Aprovações)&rdquo; para acessar o mural de trabalhos.
        </p>
      </div>
    );
  }

  const isZeroFee = isZeroFeePropulsion(activeCourier.propulsion);

  return (
    <div className="space-y-8">
      {/* Header + Active Profile Switcher */}
      <section className="flex flex-col gap-5 border-b border-zinc-200 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-emerald-700">
            Mural Operacional · Porto Alegre
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Mural do Entregador
          </h1>
          <p className="text-sm text-zinc-600">
            {lockedCourier
              ? 'Confira as oportunidades compatíveis com o seu veículo, navegue pelo mapa de Porto Alegre e registre seus comprovantes.'
              : 'Visão de supervisão: alterne o perfil ativo para inspecionar ganhos e compatibilidade entre veículos.'}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2 min-w-[280px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-zinc-700">
              Condutor Logado
            </span>
            <PropulsionTag propulsion={activeCourier.propulsion} />
          </div>

          {lockedCourier ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-900">
                {activeCourier.name}
              </p>
              <p className="text-xs text-zinc-500">
                {activeCourier.vehicleType} · {activeCourier.phone}
              </p>
              <p className="text-[11px] text-zinc-600 flex items-center gap-1.5 pt-0.5">
                <QrCode className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                {activeCourier.pixKey ? (
                  <span>
                    Pix:{' '}
                    <code className="font-mono font-medium text-zinc-900">
                      {activeCourier.pixKey}
                    </code>
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium">
                    Cadastre sua Chave Pix em Minha Conta / Segurança
                  </span>
                )}
              </p>
            </div>
          ) : (
            <>
              <select
                id="active-courier-select"
                aria-label="Selecionar condutor para supervisão"
                value={activeCourier.id}
                onChange={(e) => onSelectCourier(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
              >
                {approvedCouriers.map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courier.name} — {courier.vehicleType} ({courier.propulsion})
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <span>
                  {activeCourier.vehicleModel || activeCourier.vehicleType} · Base:{' '}
                  {activeCourier.neighborhood}
                </span>
                {pendingCouriersCount > 0 && (
                  <span className="text-amber-700 font-medium">
                    +{pendingCouriersCount} aguardando aprovação
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Discreet Vehicle Compatibility + Bike Radius Filter Banner */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-100/80 px-4 py-3 space-y-2.5 text-xs text-zinc-700">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Truck className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
            {isBike ? (
              <span>
                <strong className="font-semibold text-zinc-900">
                  Filtrando oportunidades para Bike • Raio máximo{' '}
                  {effectiveBikeRadius === null
                    ? 'Sem limite'
                    : `de até ${effectiveBikeRadius} km`}
                </strong>{' '}
                <span className="text-zinc-500">
                  ({activeCourier.propulsion || 'Combustão'})
                </span>
              </span>
            ) : (
              <span>
                Filtrando oportunidades compatíveis com seu veículo:{' '}
                <strong className="font-semibold text-zinc-900">
                  {activeCourier.vehicleType || 'Não definido'} ·{' '}
                  {activeCourier.propulsion || 'Combustão'}
                </strong>
              </span>
            )}
          </div>
          <span className="text-zinc-500">
            Exibindo: {getVehicleCompatibilityLabel(activeCourier.vehicleType)}
            {hiddenIncompatibleCount > 0
              ? ` · ${hiddenIncompatibleCount} oculto(s)`
              : ''}
          </span>
        </div>

        {isBike && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/80 pt-2.5">
            <span className="font-semibold text-zinc-800">
              Seu raio máximo hoje:
            </span>
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white p-1 border border-zinc-200">
              {BIKE_RADIUS_OPTIONS.map((opt) => {
                const isActive =
                  (activeCourier.bikeMaxRadiusKm === undefined
                    ? 3
                    : activeCourier.bikeMaxRadiusKm) === opt.value;
                return (
                  <button
                    key={opt.shortLabel}
                    type="button"
                    onClick={() => onUpdateBikeRadius(activeCourier.id, opt.value)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                    }`}
                  >
                    {opt.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Zero-Fee Clean Mobility Policy Banner */}
      {isZeroFee ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-5 py-3.5 text-sm text-emerald-950">
          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>
              <strong>Incentivo à Mobilidade Limpa ativo:</strong> sua taxa da plataforma
              é <strong>R$ 0,00</strong>. 100% da taxa do app reverte diretamente no seu
              repasse.
            </span>
          </div>
          <EvBadge propulsion={activeCourier.propulsion} />
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-zinc-200 bg-white px-5 py-3.5 text-sm text-zinc-700">
          <span>
            Perfil a <strong>Combustão</strong>: aplica-se a taxa fixa padrão (
            <span className="font-mono font-medium text-zinc-900">R$ 0,50</span> entrega
            rápida ·{' '}
            <span className="font-mono font-medium text-zinc-900">R$ 0,30/pacote</span>{' '}
            rota ·{' '}
            <span className="font-mono font-medium text-zinc-900">R$ 3,00</span> pequeno
            frete).
          </span>
          <PropulsionTag propulsion="Combustão" />
        </div>
      )}

      {/* Earnings Summary KPI Strip (Extrato Financeiro Simples) */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-zinc-500">
            Ganhos Concluídos no Dia
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
            {formatBRL(earningsSummary.completedTodayNet)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {earningsSummary.completedTodayCount} hoje · Total geral:{' '}
            <span className="font-mono font-medium text-zinc-700">
              {formatBRL(earningsSummary.completedNet)}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/35 p-4 sm:p-5">
          <p className="text-xs font-medium text-amber-900">
            A Receber / Pendente
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-800 tabular-nums">
            {formatBRL(earningsSummary.totalReceivablePending)}
          </p>
          <p className="mt-1 text-xs text-amber-800/80">
            {earningsSummary.inRouteCount} em rota + aguardando Pix/repasse
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
          <p className="text-xs font-medium text-emerald-800">
            Economia com Taxa Zero
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {formatBRL(earningsSummary.completedEvBonus)}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {isZeroFee
              ? '100% da taxa revertida ao saldo'
              : 'Disponível para Elétrico e Bike'}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-zinc-500">Disponíveis (Compatíveis)</p>
          <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
            {compatibleAvailableOrders.length}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {hiddenIncompatibleCount > 0
              ? `${hiddenIncompatibleCount} de outra categoria oculto(s)`
              : 'Prontos para aceitar em POA'}
          </p>
        </div>
      </section>

      {/* Active Jobs Execution Screen (Em Rota) */}
      {myActiveOrders.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-zinc-900">
              Execução da Entrega — Mapa, Paradas e Foto Comprovante
            </h2>
            <p className="text-xs text-zinc-500">
              Abra cada parada no GPS e confirme o recebedor com foto do comprovante. Ao
              concluir a última parada, o pedido é marcado como entregue no Supabase.
            </p>
          </div>

          <div className="space-y-6">
            {myActiveOrders.map((order) => {
              const deliveredCount = order.stops.filter((s) => s.delivered).length;
              const allStopsDelivered =
                order.stops.length > 0 && deliveredCount === order.stops.length;
              const settlement = getCourierSettlementForOrder(
                order,
                activeCourier.propulsion || 'Combustão'
              );

              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 space-y-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-900">
                          {order.code}
                        </span>
                        <span aria-hidden="true">·</span>
                        {order.type === 'frete' && <FreightBadge compact />}
                        <span>{order.merchantName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {deliveredCount}/{order.stops.length} paradas entregues
                        </span>
                      </div>
                      <h3 className="font-display text-base font-semibold text-zinc-900">
                        Coleta: {order.pickupNeighborhood} ({order.pickupAddress}) →{' '}
                        {order.destinationNeighborhood}
                      </h3>
                      {order.type === 'frete' && order.freightDetails && (
                        <p className="text-xs text-zinc-600">
                          Carga: <strong>{order.freightDetails.cargoDescription}</strong>{' '}
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
                        <p className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                          {formatBRL(settlement.netPayout)}
                        </p>
                        <p className="text-xs text-zinc-500 font-mono tabular-nums">
                          {settlement.evBonus > 0
                            ? `Inclui +${formatBRL(settlement.evBonus)} Bônus EV`
                            : `Taxa ${formatBRL(settlement.platformFee)}`}
                        </p>
                      </div>
                      <OrderStatusBadge status={order.status} />
                      <PaymentStatusBadge status={order.paymentStatus} compact />
                    </div>
                  </div>

                  {/* Interactive Map + Sequential Stops List */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
                    <div className="lg:col-span-5">
                      <PortoAlegreMap
                        pickup={{
                          label: order.merchantName,
                          address: order.pickupAddress,
                          neighborhood: order.pickupNeighborhood,
                          lat: order.pickupLat,
                          lng: order.pickupLng,
                        }}
                        stops={order.stops}
                        heightClass="h-[320px] lg:h-[380px]"
                        title={`Rota ${order.code} · Porto Alegre`}
                      />
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
                            className={`rounded-lg border p-4 space-y-3 ${
                              stop.delivered
                                ? 'border-emerald-200 bg-emerald-50/40'
                                : 'border-zinc-200 bg-zinc-50/70'
                            }`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 font-mono text-[11px] font-bold text-white">
                                    {stop.sequence}
                                  </span>
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

                              {/* Individual Stop Status */}
                              {stop.delivered ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 whitespace-nowrap shrink-0">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                                  <span>Entregue</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 whitespace-nowrap shrink-0">
                                  <Clock className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                                  <span>Pendente</span>
                                </span>
                              )}
                            </div>

                            {/* Action Buttons per Stop */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <a
                                href={gpsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 whitespace-nowrap"
                              >
                                <Navigation className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                                <span>Abrir no GPS</span>
                                <ExternalLink className="h-3 w-3 text-zinc-400" aria-hidden="true" />
                              </a>

                              {!stop.delivered && !isConfirming && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenConfirmForm(stop.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                                >
                                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Confirmar Entrega</span>
                                </button>
                              )}
                            </div>

                            {/* Receiver Name + Photo Proof Confirmation Prompt */}
                            {!stop.delivered && isConfirming && (
                              <div className="rounded-lg border border-emerald-200 bg-white p-3.5 space-y-3">
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
                                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                                  />
                                  {stop.expectedRecipient && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReceiverInputs((prev) => ({
                                          ...prev,
                                          [stop.id]: stop.expectedRecipient || '',
                                        }))
                                      }
                                      className="mt-1 text-[11px] font-medium text-emerald-700 hover:underline"
                                    >
                                      Usar recebedor previsto: {stop.expectedRecipient}
                                    </button>
                                  )}
                                </div>

                                {/* Photo Capture / Upload with 600px JPEG Compression */}
                                <div className="space-y-2 border-t border-zinc-100 pt-2.5">
                                  <span className="block text-xs font-semibold text-zinc-800">
                                    Foto do Comprovante (Opcional · câmera ou arquivo)
                                  </span>

                                  <div className="flex flex-wrap items-center gap-3">
                                    <label
                                      htmlFor={`photo-input-${stop.id}`}
                                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
                                    >
                                      <Camera
                                        className="h-3.5 w-3.5 text-emerald-600"
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
                                          handlePhotoSelected(stop.id, file);
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
                                          onClick={() => handleRemovePhoto(stop.id)}
                                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-3 w-3" aria-hidden="true" />
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
                                      handleStopConfirmSubmit(order.id, stop.id)
                                    }
                                    className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    Salvar Confirmação
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingStopId(null)}
                                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 whitespace-nowrap"
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

                  {/* Finalizar Rota Completa Gate */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-zinc-100 pt-4">
                    <p className="text-xs text-zinc-600">
                      {allStopsDelivered ? (
                        <span className="font-semibold text-emerald-800">
                          Todas as {order.stops.length} paradas concluídas! Libere seu
                          ganho líquido de {formatBRL(settlement.netPayout)} finalizando
                          a rota.
                        </span>
                      ) : (
                        <span>
                          Conclua todas as paradas ({deliveredCount}/{order.stops.length}
                          ) para liberar o botão de finalização.
                        </span>
                      )}
                    </p>

                    <button
                      type="button"
                      disabled={!allStopsDelivered}
                      onClick={() => onCompleteOrder(order.id)}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        allStopsDelivered
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400'
                      }`}
                    >
                      <Flag className="h-4 w-4" aria-hidden="true" />
                      <span>Finalizar Rota Completa</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Available Orders Board */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-zinc-900">
            Entregas, Rotas e Fretes Disponíveis
          </h2>
          <p className="text-xs text-zinc-500">
            Valores exibidos já considerando o seu veículo ({activeCourier.propulsion}).
          </p>
        </div>

        {compatibleAvailableOrders.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-zinc-900">
              Nenhum trabalho compatível com {activeCourier.vehicleType} no momento.
            </p>
            <p className="text-xs text-zinc-600 max-w-lg mx-auto leading-relaxed">
              {hiddenIncompatibleCount > 0
                ? `Há ${hiddenIncompatibleCount} pedido(s) aguardando de outra categoria (como Pequeno Frete ou entregas de Moto/Bike), mas eles estão ocultos automaticamente por compatibilidade de veículo.`
                : 'Crie uma nova solicitação compatível na aba "Painel do Lojista" para visualizá-la aqui.'}
            </p>
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

              return (
                <article
                  key={order.id}
                  className={`flex flex-col justify-between rounded-xl border p-5 space-y-4 ${
                    isHighlightedUtilityFreight
                      ? 'border-amber-300 bg-amber-50/15'
                      : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-900">
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
                              ? `Entrega Rápida (${order.distanceKm?.toLocaleString('pt-BR')} km)`
                              : `Rota Consolidada (${order.packageCount} pacotes)`}
                          </span>
                        )}
                      </div>
                      <OrderStatusBadge status={order.status} />
                    </div>

                    <div>
                      <p className="text-xs text-zinc-500">
                        Solicitado por {order.merchantName}
                      </p>
                      <h3 className="mt-0.5 font-display text-base font-semibold text-zinc-900">
                        {order.pickupNeighborhood} → {order.destinationNeighborhood}
                      </h3>
                      <p className="text-xs text-zinc-600 mt-1">
                        Coleta em: {order.pickupAddress} ({order.pickupNeighborhood})
                      </p>
                    </div>

                    {order.type === 'frete' && order.freightDetails && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-900">
                            Carga: {order.freightDetails.cargoDescription}
                          </span>
                          <span className="font-mono text-zinc-600 shrink-0">
                            {order.distanceKm?.toLocaleString('pt-BR')} km
                          </span>
                        </div>
                        <p className="text-zinc-700">
                          Porte:{' '}
                          <strong>
                            {order.freightDetails.cargoSize === 'grande'
                              ? 'Grande/Volumoso'
                              : 'Médio'}
                          </strong>{' '}
                          ·{' '}
                          <strong
                            className={
                              order.freightDetails.includeHelper
                                ? 'text-emerald-800'
                                : 'text-zinc-700'
                            }
                          >
                            {order.freightDetails.includeHelper
                              ? 'Inclui Ajudante (+R$ 40,00)'
                              : 'Sem ajudante'}
                          </strong>
                        </p>
                        <p className="text-zinc-600">
                          Acesso: {order.freightDetails.accessNote}
                        </p>
                      </div>
                    )}

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-zinc-600">
                        <span>Repasse base do trabalho</span>
                        <span className="font-mono font-medium text-zinc-900 tabular-nums">
                          {formatBRL(order.basePayout)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-600">
                        <span>Taxa da plataforma ({activeCourier.propulsion})</span>
                        <span className="font-mono font-medium text-zinc-900 tabular-nums">
                          {formatBRL(settlement.platformFee)}
                        </span>
                      </div>
                      {isZeroFee && (
                        <div className="flex items-center justify-between text-emerald-700 font-medium">
                          <span>Incentivo Mobilidade Limpa (100% da taxa)</span>
                          <span className="font-mono tabular-nums">
                            +{formatBRL(settlement.evBonus)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-zinc-200 pt-2 font-semibold text-zinc-900">
                        <span>Seu ganho líquido total</span>
                        <span className="font-mono text-base text-emerald-700 tabular-nums">
                          {formatBRL(settlement.netPayout)}
                        </span>
                      </div>
                    </div>

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
                        heightClass="h-[230px]"
                        title={`Prévia ${order.code}`}
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      {isZeroFee ? (
                        <EvBadge compact propulsion={activeCourier.propulsion} />
                      ) : (
                        <span className="text-xs text-zinc-500">
                          {order.stops.length} parada(s)
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewMapOrderId(isMapOpen ? null : order.id)
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        <MapIcon className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span>{isMapOpen ? 'Ocultar Mapa' : 'Ver no Mapa'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onAcceptOrder(order.id, activeCourier)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 whitespace-nowrap shrink-0"
                    >
                      <Truck className="h-4 w-4" aria-hidden="true" />
                      <span>Aceitar Trabalho</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {isBike && effectiveBikeRadius !== null && exceededBikeRadiusCount > 0 && (
          <p className="text-xs text-zinc-500 pt-1">
            {exceededBikeRadiusCount === 1
              ? `Existe 1 entrega acima de ${effectiveBikeRadius} km oculta pelo seu filtro de raio.`
              : `Existem ${exceededBikeRadiusCount} entregas acima de ${effectiveBikeRadius} km ocultas pelo seu filtro de raio.`}
          </p>
        )}
      </section>

      {/* Completed Deliveries History */}
      {myCompletedOrders.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-zinc-900">
            Histórico Concluído de {activeCourier.name}
          </h2>
          <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white overflow-hidden">
            {myCompletedOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between text-sm"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-zinc-500">
                      {order.code}
                    </span>
                    {order.type === 'frete' && <FreightBadge compact />}
                    <span className="font-medium text-zinc-900">
                      {order.pickupNeighborhood} → {order.destinationNeighborhood}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {order.stops.length} parada(s) ·{' '}
                    {formatPaymentMethodLabel(order.paymentMethod)} ·{' '}
                    {order.completedAt
                      ? `Finalizado em ${formatDateTimeBR(order.completedAt)}`
                      : 'Entrega concluída'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <PaymentStatusBadge status={order.paymentStatus} compact />
                  {(order.evBonusApplied ?? 0) > 0 && (
                    <EvBadge compact propulsion={activeCourier.propulsion} />
                  )}
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    +{formatBRL(order.netCourierPayout ?? order.basePayout)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
