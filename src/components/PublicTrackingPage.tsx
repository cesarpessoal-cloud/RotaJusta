import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BellRing,
  Bike,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Hash,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  ShoppingBag,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchDeliveryByIdWithStops,
  fetchPublicOrderTrackingByCode,
  fetchPublicProfilesDirectory,
} from '../lib/supabaseService';
import { CourierQuickNotice, Order, Profile } from '../types';
import { formatVehicleModelAndColor } from '../utils/courierIdentity';
import { formatPickupCode } from '../utils/pickupCode';
import { formatBRL, formatDateTimeBR } from '../utils/pricing';
import {
  buildMerchantShareWhatsAppMessage,
  buildTrackingUrl,
  buildWhatsAppUrl,
  QUICK_NOTICE_META,
} from '../utils/quickNotice';
import {
  playDiscreteQuickNoticeChime,
  unlockAudioEngine,
} from '../utils/soundAlert';
import { CourierAvatar, VehiclePlateBadge } from './CourierAvatar';
import { FreightBadge, OrderStatusBadge } from './EvBadge';
import { PortoAlegreMap } from './PortoAlegreMap';
import { RatingBadge } from './RatingWidgets';

interface PublicTrackingPageProps {
  initialCode?: string;
  onBackToLanding: () => void;
  onOpenLogin: () => void;
}

function getOrderStatusLabel(status: Order['status']): string {
  if (status === 'Aguardando') return 'Aguardando entregador';
  if (status === 'Em Rota') return 'Em Rota';
  return 'Entregue';
}

export function PublicTrackingPage({
  initialCode = '',
  onBackToLanding,
  onOpenLogin,
}: PublicTrackingPageProps) {
  const [codeInput, setCodeInput] = useState<string>(initialCode);
  const [order, setOrder] = useState<Order | null>(null);
  const [profilesCache, setProfilesCache] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(initialCode));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [activeAlertNotice, setActiveAlertNotice] =
    useState<CourierQuickNotice | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const lastSeenNoticeKeyRef = useRef<string | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const applyFetchedOrder = useCallback(
    (freshOrder: Order | null, notifyIfNew: boolean) => {
      if (!freshOrder) {
        setOrder(null);
        return;
      }

      const nextNotice = freshOrder.courierQuickNotice;
      const nextKey = nextNotice
        ? `${nextNotice.type}|${nextNotice.updatedAt}`
        : null;

      if (
        notifyIfNew &&
        nextNotice &&
        nextKey &&
        nextKey !== lastSeenNoticeKeyRef.current
      ) {
        setActiveAlertNotice(nextNotice);
        if (soundEnabledRef.current) {
          void playDiscreteQuickNoticeChime();
        }
      }

      if (nextKey) {
        lastSeenNoticeKeyRef.current = nextKey;
      }

      setOrder(freshOrder);
    },
    []
  );

  const loadByCode = useCallback(
    async (rawCode: string, silent = false) => {
      const clean = rawCode.trim();
      if (!clean) {
        setErrorMsg('Digite o código do pedido (ex.: #RS-XXXX).');
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setErrorMsg(null);
        lastSeenNoticeKeyRef.current = null;
        setActiveAlertNotice(null);
      }

      try {
        const found = await fetchPublicOrderTrackingByCode(clean);
        if (!found) {
          if (!silent) {
            setOrder(null);
            setErrorMsg(
              `Pedido "${clean}" não encontrado. Confira o código #RS-XXXX enviado pelo lojista.`
            );
          }
          return;
        }

        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('rastreio', found.code.replace(/^#/, ''));
          window.history.replaceState({}, '', url.toString());
        }

        const dir = await fetchPublicProfilesDirectory().catch(
          () => [] as Profile[]
        );
        setProfilesCache(dir);

        applyFetchedOrder(found, silent);
      } catch (err) {
        if (!silent) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Erro ao consultar rastreamento do pedido.'
          );
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [applyFetchedOrder]
  );

  useEffect(() => {
    if (initialCode.trim()) {
      void loadByCode(initialCode, false);
    }
  }, [initialCode, loadByCode]);

  // Unlock Web Audio on first tap/click inside the public tracking page
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (soundEnabledRef.current) {
        void unlockAudioEngine();
      }
    };
    window.addEventListener('pointerdown', handleFirstInteraction, {
      once: true,
    });
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
    };
  }, []);

  // Real-time Supabase updates for the tracked delivery & stops
  useEffect(() => {
    if (!order?.id) return;
    const deliveryId = order.id;

    const refreshCurrentOrder = async () => {
      try {
        const dir =
          profilesCache.length > 0
            ? profilesCache
            : await fetchPublicProfilesDirectory().catch(() => [] as Profile[]);
        const fresh = await fetchDeliveryByIdWithStops(deliveryId, dir);
        if (fresh) {
          applyFetchedOrder(fresh, true);
        }
      } catch {
        // Ignore transient background fetch error
      }
    };

    const channel = supabase
      .channel(`rotajusta-public-track-${deliveryId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deliveries',
          filter: `id=eq.${deliveryId}`,
        },
        () => {
          void refreshCurrentOrder();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_stops',
          filter: `delivery_id=eq.${deliveryId}`,
        },
        () => {
          void refreshCurrentOrder();
        }
      )
      .subscribe();

    const pollInterval =
      order.status !== 'Entregue'
        ? window.setInterval(() => {
            void refreshCurrentOrder();
          }, 15000)
        : undefined;

    return () => {
      void supabase.removeChannel(channel);
      if (pollInterval) {
        window.clearInterval(pollInterval);
      }
    };
  }, [order?.id, order?.status, profilesCache, applyFetchedOrder]);

  useEffect(() => {
    if (!activeAlertNotice) return;
    const timer = window.setTimeout(() => setActiveAlertNotice(null), 25000);
    return () => window.clearTimeout(timer);
  }, [activeAlertNotice]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void unlockAudioEngine();
    void loadByCode(codeInput, false);
  };

  const handleToggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      await unlockAudioEngine();
      await playDiscreteQuickNoticeChime();
    }
  };

  const trackingUrl = order ? buildTrackingUrl(order.code) : '';

  const handleCopyTrackingLink = async () => {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const whatsappShareHref = order
    ? buildWhatsAppUrl({
        phone: order.merchantPhone,
        message: buildMerchantShareWhatsAppMessage({
          orderCode: order.code,
          statusLabel: getOrderStatusLabel(order.status),
          activeNotice: order.courierQuickNotice,
          courierName: order.assignedCourierName,
          vehicleSummary: formatVehicleModelAndColor(
            order.assignedCourierVehicleModel,
            order.assignedCourierVehicleColor
          ),
          plate:
            order.assignedCourierVehicleType === 'Bike'
              ? undefined
              : order.assignedCourierPlate,
          trackingUrl,
        }),
      })
    : '#';

  const eventsTimeline = order?.courierNoticeHistory || [];
  const activeNoticeMeta = order?.courierQuickNotice
    ? QUICK_NOTICE_META[order.courierQuickNotice.type]
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs shrink-0">
              <Route className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="font-display text-base sm:text-lg font-bold tracking-tight text-zinc-950 block leading-none">
                RotaJusta · Rastreamento
              </span>
              <span className="text-[11px] font-medium text-emerald-700 mt-0.5 block truncate">
                Acompanhamento público em tempo real · Porto Alegre
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleToggleSound()}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                soundEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100'
              }`}
              title="Ativar ou silenciar aviso sonoro discreto"
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {soundEnabled ? 'Som Ativo' : 'Som Mudo'}
              </span>
            </button>

            <button
              type="button"
              onClick={onBackToLanding}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Início</span>
            </button>

            <button
              type="button"
              onClick={onOpenLogin}
              className="hidden sm:inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
            >
              Entrar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 space-y-6">
        {/* Highlighted Real-Time Alert Banner when courier clicks Estou chegando / Cheguei */}
        {activeAlertNotice && order && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-2xl border-2 border-emerald-500 bg-emerald-600 p-4 text-white shadow-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 shrink-0 mt-0.5">
                <BellRing className="h-5 w-5 text-white animate-bounce" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-950 px-2 py-0.5 font-mono text-xs font-black text-white">
                    {order.code}
                  </span>
                  <span className="text-xs font-semibold text-emerald-100">
                    Atualização em tempo real ·{' '}
                    {formatDateTimeBR(activeAlertNotice.updatedAt)}
                  </span>
                </div>
                <p className="font-display text-base sm:text-lg font-extrabold leading-snug">
                  {QUICK_NOTICE_META[activeAlertNotice.type].clientHeadline}
                </p>
                <p className="text-xs text-emerald-50">
                  {QUICK_NOTICE_META[activeAlertNotice.type].clientSubtext}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={whatsappShareHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 whitespace-nowrap"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Enviar no WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => setActiveAlertNotice(null)}
                className="rounded-xl border border-white/40 bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25"
              >
                Ciente
              </button>
            </div>
          </div>
        )}

        {/* Search / Lookup Bar for #RS-XXXX */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-2xs">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="flex-1">
              <label
                htmlFor="public-track-code"
                className="block text-xs font-semibold text-zinc-700 mb-1"
              >
                Consultar pedido pelo código de rastreamento (#RS-XXXX)
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  id="public-track-code"
                  type="text"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Ex.: #RS-A1B2 ou RS-A1B2"
                  className="w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-3 py-2.5 font-mono text-sm font-semibold uppercase text-zinc-900 placeholder:normal-case placeholder:font-normal focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:pt-5">
              <button
                type="submit"
                disabled={isLoading}
                className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" aria-hidden="true" />
                    <span>Rastrear Agora</span>
                  </>
                )}
              </button>

              {order && (
                <button
                  type="button"
                  onClick={() => void loadByCode(order.code, false)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  title="Atualizar agora"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Atualizar</span>
                </button>
              )}
            </div>
          </form>
        </section>

        {errorMsg && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <p className="font-semibold">{errorMsg}</p>
          </div>
        )}

        {!isLoading && !order && !errorMsg && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center space-y-2">
            <Package className="mx-auto h-8 w-8 text-emerald-600" aria-hidden="true" />
            <h1 className="font-display text-lg font-bold text-zinc-900">
              Acompanhe sua entrega em Porto Alegre
            </h1>
            <p className="text-xs sm:text-sm text-zinc-600 max-w-md mx-auto">
              Informe o código <strong>#RS-XXXX</strong> enviado pelo lojista ou
              entregador para ver a posição no mapa, placa/foto do condutor e
              receber avisos de chegada em tempo real.
            </p>
          </div>
        )}

        {order && (
          <div className="space-y-5">
            {/* Main Tracking Summary Card */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5 shadow-2xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-zinc-100 pb-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-950 px-2.5 py-1 font-mono text-sm font-black tracking-wider text-white">
                      <Hash className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                      <span>{order.code.replace(/^#/, '')}</span>
                    </span>
                    <OrderStatusBadge status={order.status} />
                    {order.type === 'frete' && <FreightBadge compact />}
                  </div>

                  <h1 className="font-display text-lg sm:text-xl font-bold text-zinc-950">
                    {order.pickupNeighborhood} → {order.destinationNeighborhood}
                  </h1>
                  <p className="text-xs text-zinc-600">
                    Solicitante: <strong>{order.merchantName}</strong> · Criado em{' '}
                    {formatDateTimeBR(order.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCopyTrackingLink()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span>Link Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copiar Link</span>
                      </>
                    )}
                  </button>

                  <a
                    href={whatsappShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-700 whitespace-nowrap"
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Enviar no WhatsApp ({order.code})</span>
                    <ExternalLink className="h-3 w-3 opacity-80" aria-hidden="true" />
                  </a>
                </div>
              </div>

              {/* Active Real-Time Status Notice */}
              {order.status === 'Em Rota' && order.courierQuickNotice && activeNoticeMeta && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`rounded-xl border-2 p-4 space-y-1.5 ${
                    activeNoticeMeta.tone === 'amber'
                      ? 'border-amber-500 bg-amber-50 text-amber-950'
                      : activeNoticeMeta.tone === 'blue'
                      ? 'border-sky-500 bg-sky-50 text-sky-950'
                      : 'border-emerald-500 bg-emerald-50 text-emerald-950'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider">
                      <BellRing className="h-4 w-4" aria-hidden="true" />
                      <span>Aviso do Entregador ({order.code})</span>
                    </span>
                    <span className="font-mono text-xs font-semibold">
                      {formatDateTimeBR(order.courierQuickNotice.updatedAt)}
                    </span>
                  </div>
                  <p className="font-display text-base font-extrabold">
                    {activeNoticeMeta.clientHeadline}
                    {order.courierQuickNotice.stopSequence &&
                    order.stops.length > 1
                      ? ` (Parada #${order.courierQuickNotice.stopSequence})`
                      : ''}
                  </p>
                  <p className="text-xs opacity-90">{activeNoticeMeta.clientSubtext}</p>
                </div>
              )}

              {/* Courier Security Identification Card */}
              {order.status !== 'Aguardando' && order.assignedCourierName && (
                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <CourierAvatar
                      name={order.assignedCourierName}
                      avatarUrl={order.assignedCourierAvatarUrl}
                      size="lg"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
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
                        {formatVehicleModelAndColor(
                          order.assignedCourierVehicleModel,
                          order.assignedCourierVehicleColor
                        )
                          ? ` · ${formatVehicleModelAndColor(
                              order.assignedCourierVehicleModel,
                              order.assignedCourierVehicleColor
                            )}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {order.assignedCourierVehicleType === 'Bike' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800">
                        <Bike className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        <span>Entrega de Bicicleta</span>
                      </span>
                    ) : (
                      <VehiclePlateBadge plate={order.assignedCourierPlate} />
                    )}
                  </div>
                </div>
              )}

              {/* Itens do Pedido da Vitrine */}
              {order.storefrontOrder && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-950">
                      <ShoppingBag
                        className="h-4 w-4 text-emerald-700"
                        aria-hidden="true"
                      />
                      <span>
                        Itens do Pedido ({order.code})
                        {order.storefrontOrder.customerName
                          ? ` · ${order.storefrontOrder.customerName}`
                          : ''}
                      </span>
                    </span>
                    <span className="font-mono font-bold text-emerald-900 tabular-nums">
                      Total c/ frete:{' '}
                      {formatBRL(order.storefrontOrder.grandTotal)}
                    </span>
                  </div>
                  <ul className="space-y-1 text-zinc-700">
                    {order.storefrontOrder.items.map((item) => (
                      <li
                        key={`${order.id}-track-${item.productId}-${item.name}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>
                          <strong className="font-mono text-zinc-900">
                            {item.quantity}x
                          </strong>{' '}
                          {item.name}
                        </span>
                        <span className="font-mono text-zinc-900 tabular-nums">
                          {formatBRL(item.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-emerald-200/80 pt-1.5 text-[11px] text-emerald-950 flex flex-wrap gap-x-4 gap-y-0.5 font-mono tabular-nums">
                    <span>
                      Produtos:{' '}
                      {formatBRL(order.storefrontOrder.productsSubtotal)}
                    </span>
                    <span>
                      Frete RotaJusta:{' '}
                      {formatBRL(order.storefrontOrder.freightTotal)}
                    </span>
                  </p>
                </div>
              )}

              {/* Map + Stops + Timestamped Event Timeline */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
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
                    heightClass="h-[290px]"
                    title={`Mapa ao vivo ${order.code}`}
                  />
                </div>

                <div className="lg:col-span-6 space-y-4">
                  {/* Timestamped Events Timeline */}
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-2.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Linha do Tempo em Tempo Real ({order.code})</span>
                    </h2>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2 text-zinc-700">
                        <span className="font-medium">Pedido publicado</span>
                        <span className="font-mono text-[11px] text-zinc-500">
                          {formatDateTimeBR(order.createdAt)}
                        </span>
                      </div>

                      {eventsTimeline.map((evt, idx) => (
                        <div
                          key={`${evt.type}-${evt.updatedAt}-${idx}`}
                          className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-zinc-800"
                        >
                          <div className="flex items-start gap-1.5">
                            <BellRing
                              className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <span className="font-semibold">
                              {QUICK_NOTICE_META[evt.type].clientHeadline}
                              {evt.stopSequence && order.stops.length > 1
                                ? ` (Parada #${evt.stopSequence})`
                                : ''}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-emerald-700 shrink-0">
                            {formatDateTimeBR(evt.updatedAt)}
                          </span>
                        </div>
                      ))}

                      {order.status === 'Entregue' && (
                        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-emerald-900 font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                            <span>Entrega concluída</span>
                          </span>
                          <span className="font-mono text-[11px]">
                            {formatDateTimeBR(
                              order.completedAt ||
                                order.stops.find((s) => s.deliveredAt)
                                  ?.deliveredAt ||
                                order.createdAt
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stops Summary */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                      Paradas ({order.stops.filter((s) => s.delivered).length}/
                      {order.stops.length})
                    </h3>
                    {order.stops.map((stop) => (
                      <div
                        key={stop.id}
                        className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs ${
                          stop.delivered
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : 'border-zinc-200 bg-white'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-semibold text-zinc-900">
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
                            <MapPin
                              className="inline h-3 w-3 mr-1 text-zinc-400"
                              aria-hidden="true"
                            />
                            Bairro {stop.neighborhood}
                            {stop.expectedRecipient
                              ? ` · Destinatário: ${stop.expectedRecipient}`
                              : ''}
                          </p>
                          {stop.delivered && stop.receiverName && (
                            <p className="text-emerald-700 font-semibold">
                              Entregue para {stop.receiverName}
                              {stop.deliveredAt
                                ? ` (${formatDateTimeBR(stop.deliveredAt)})`
                                : ''}
                            </p>
                          )}
                        </div>

                        {stop.delivered ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Entregue</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium shrink-0">
                            Em andamento
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
