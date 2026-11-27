import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Plus,
  Route,
  Search,
  ShoppingBag,
  Store,
  Trash2,
} from 'lucide-react';
import { resolvePortoAlegreCoordinates } from '../constants/portoAlegre';
import {
  createDeliveryInSupabase,
  fetchPublicMerchantStorefrontInSupabase,
  PublicStorefrontData,
  updateDeliveryPaymentStatusInSupabase,
} from '../lib/supabaseService';
import {
  Order,
  PixPaymentMethod,
  StorefrontOrderSummary,
  StoreProduct,
  VehicleType,
} from '../types';
import {
  calculateUrbanDistanceKm,
  formatFullAddressLine,
  StructuredAddressValue,
} from '../utils/addressLookup';
import { formatPickupCode } from '../utils/pickupCode';
import {
  calculatePricing,
  formatBRL,
  formatVehicleModalDisplayName,
} from '../utils/pricing';
import {
  buildTrackingUrl,
  buildWhatsAppUrl,
  extractBrPhoneDigits,
} from '../utils/quickNotice';
import {
  formatShortVehicleLabel,
  formatStorefrontItemsSummaryText,
  resolveRecommendedVehicleForCart,
} from '../utils/storefront';
import { AddressAutocompleteFields } from './AddressAutocompleteFields';
import { PixQrCodeSettlement } from './PixQrCodeSettlement';
import { RatingBadge } from './RatingWidgets';

interface PublicStorefrontPageProps {
  merchantId: string;
  onBackToRotaJusta: () => void;
  backButtonLabel?: string;
  onOpenTracking: (orderCode: string) => void;
  onOrderCreated?: (order: Order) => void;
}

interface CartEntry {
  product: StoreProduct;
  quantity: number;
}

export function PublicStorefrontPage({
  merchantId,
  onBackToRotaJusta,
  backButtonLabel = 'Voltar ao RotaJusta',
  onOpenTracking,
  onOrderCreated,
}: PublicStorefrontPageProps) {
  const [storeData, setStoreData] = useState<PublicStorefrontData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<'Todos' | VehicleType>('Todos');
  const [cart, setCart] = useState<Record<string, CartEntry>>({});

  // Checkout & Delivery Address state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<PixPaymentMethod>('pix_direto');
  const [destAddr, setDestAddr] = useState<StructuredAddressValue>({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: 'Centro Histórico',
    cityUf: 'Porto Alegre / RS',
  });

  const [checkoutError, setCheckoutError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Completed Storefront Order state (Pix QR Code + Tracking)
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [isConfirmingPixSent, setIsConfirmingPixSent] = useState(false);

  useEffect(() => {
    let active = true;
    const loadStore = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetchPublicMerchantStorefrontInSupabase(merchantId);
        if (!active) return;
        if (!res) {
          setLoadError('Loja não encontrada ou link inválido.');
          setStoreData(null);
        } else {
          setStoreData(res);
        }
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar vitrine da loja.'
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadStore();
    return () => {
      active = false;
    };
  }, [merchantId]);

  const activeProducts = useMemo(() => {
    if (!storeData) return [];
    return storeData.storefront.products.filter((p) => p.active);
  }, [storeData]);

  const filteredProducts = useMemo(() => {
    return activeProducts.filter((p) => {
      if (vehicleFilter !== 'Todos' && p.recommendedVehicle !== vehicleFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeProducts, vehicleFilter, searchQuery]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const totalCartItemsCount = useMemo(
    () => cartItems.reduce((sum, entry) => sum + entry.quantity, 0),
    [cartItems]
  );

  const productsSubtotal = useMemo(
    () =>
      Number(
        cartItems
          .reduce(
            (sum, entry) => sum + entry.product.price * entry.quantity,
            0
          )
          .toFixed(2)
      ),
    [cartItems]
  );

  const recommendedVehicle = useMemo(
    () => resolveRecommendedVehicleForCart(cartItems),
    [cartItems]
  );

  const pickupLocation = useMemo(() => {
    const sf = storeData?.storefront;
    const address = sf?.storeAddress || 'Rua dos Andradas, 1234';
    const neighborhood = sf?.storeNeighborhood || 'Centro Histórico';
    const coords =
      sf?.storeLat !== undefined && sf?.storeLng !== undefined
        ? { lat: sf.storeLat, lng: sf.storeLng }
        : resolvePortoAlegreCoordinates(address, neighborhood, 0);
    return {
      address,
      neighborhood,
      lat: coords.lat,
      lng: coords.lng,
    };
  }, [storeData]);

  const hasDestinationFilled = Boolean(
    destAddr.street.trim() || destAddr.neighborhood.trim()
  );

  const calculatedDistanceKm = useMemo(() => {
    if (!hasDestinationFilled) return 3.0;
    const destLine = formatFullAddressLine(destAddr);
    const destNb = destAddr.neighborhood.trim() || 'Centro Histórico';
    const destCoords =
      destAddr.lat !== undefined && destAddr.lng !== undefined
        ? { lat: destAddr.lat, lng: destAddr.lng }
        : resolvePortoAlegreCoordinates(destLine, destNb, 1);

    return calculateUrbanDistanceKm(
      pickupLocation.lat,
      pickupLocation.lng,
      destCoords.lat,
      destCoords.lng
    );
  }, [hasDestinationFilled, destAddr, pickupLocation]);

  const freightPricing = useMemo(
    () =>
      calculatePricing(
        'rapida',
        calculatedDistanceKm,
        1,
        undefined,
        recommendedVehicle
      ),
    [calculatedDistanceKm, recommendedVehicle]
  );

  const grandTotal = useMemo(
    () => Number((productsSubtotal + freightPricing.grossTotal).toFixed(2)),
    [productsSubtotal, freightPricing.grossTotal]
  );

  const handleAddToCart = (product: StoreProduct) => {
    setCheckoutError('');
    setCart((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return {
        ...prev,
        [productId]: {
          ...existing,
          quantity: nextQty,
        },
      };
    });
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeData) return;
    setCheckoutError('');

    if (cartItems.length === 0) {
      setCheckoutError('Adicione pelo menos 1 produto ao carrinho antes de finalizar.');
      return;
    }
    if (!customerName.trim()) {
      setCheckoutError('Informe seu nome completo para a entrega.');
      return;
    }
    if (!destAddr.street.trim()) {
      setCheckoutError(
        'Informe o CEP ou a rua e número de entrega em Porto Alegre.'
      );
      return;
    }

    const formattedDestAddress = formatFullAddressLine(destAddr);
    const destNb = destAddr.neighborhood.trim() || 'Porto Alegre';
    const destCoords =
      destAddr.lat !== undefined && destAddr.lng !== undefined
        ? { lat: destAddr.lat, lng: destAddr.lng }
        : resolvePortoAlegreCoordinates(formattedDestAddress, destNb, 1);

    const storefrontOrder: StorefrontOrderSummary = {
      items: cartItems.map((entry) => ({
        productId: entry.product.id,
        name: entry.product.name,
        quantity: entry.quantity,
        unitPrice: entry.product.price,
        lineTotal: Number((entry.product.price * entry.quantity).toFixed(2)),
      })),
      productsSubtotal,
      freightTotal: freightPricing.grossTotal,
      grandTotal,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
    };

    const itemsText = formatStorefrontItemsSummaryText(storefrontOrder);
    const noteCombined = [itemsText, deliveryNote.trim()]
      .filter(Boolean)
      .join(' · Obs: ');

    const newOrderId = crypto.randomUUID();
    const stopId = crypto.randomUUID();
    const displayStoreName =
      storeData.storefront.storeName ||
      storeData.merchant.businessName ||
      storeData.merchant.name;

    const newOrder: Order = {
      id: newOrderId,
      code: formatPickupCode(newOrderId),
      type: 'rapida',
      requestedVehicle: recommendedVehicle,
      flowDirection: 'enviar',
      pickupSchedule: { mode: 'imediata' },
      merchantId: storeData.merchant.id,
      merchantName: displayStoreName,
      merchantPhone: storeData.merchant.phone,
      pickupAddress: pickupLocation.address,
      pickupNeighborhood: pickupLocation.neighborhood,
      pickupLat: pickupLocation.lat,
      pickupLng: pickupLocation.lng,
      destinationNeighborhood: destNb,
      distanceKm: calculatedDistanceKm,
      packageCount: 1,
      storefrontOrder,
      stops: [
        {
          id: stopId,
          pickupCode: formatPickupCode(stopId),
          sequence: 1,
          address: formattedDestAddress,
          neighborhood: destNb,
          expectedRecipient: customerName.trim(),
          recipientNote: noteCombined,
          lat: destCoords.lat,
          lng: destCoords.lng,
          delivered: false,
        },
      ],
      grossTotal: freightPricing.grossTotal,
      standardPlatformFee: freightPricing.standardPlatformFee,
      basePayout: freightPricing.basePayout,
      status: 'Aguardando',
      paymentMethod,
      paymentStatus: 'pendente_pagamento',
      createdAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      const savedOrder = await createDeliveryInSupabase(newOrder);
      const enrichedOrder: Order = {
        ...savedOrder,
        storefrontOrder: savedOrder.storefrontOrder || storefrontOrder,
        merchantPhone: storeData.merchant.phone,
      };
      setCreatedOrder(enrichedOrder);
      setCart({});
      onOrderCreated?.(enrichedOrder);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : 'Não foi possível finalizar o pedido na vitrine agora.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPixSent = async () => {
    if (!createdOrder) return;
    setIsConfirmingPixSent(true);
    try {
      const updated = await updateDeliveryPaymentStatusInSupabase(
        createdOrder.id,
        'pago_lojista'
      );
      setCreatedOrder((prev) =>
        prev
          ? {
              ...updated,
              storefrontOrder: prev.storefrontOrder,
              merchantPhone: prev.merchantPhone,
            }
          : updated
      );
    } finally {
      setIsConfirmingPixSent(false);
    }
  };

  const storeDisplayName =
    storeData?.storefront.storeName ||
    storeData?.merchant.businessName ||
    storeData?.merchant.name ||
    'Loja Local RotaJusta';

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      {/* Top Bar Contract: 3 zones separated cleanly */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#vitrine-catalogo"
            className="font-display text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0"
          >
            {storeDisplayName}
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <a
              href="#vitrine-catalogo"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Catálogo
            </a>
            <a
              href="#vitrine-checkout"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              Carrinho ({totalCartItemsCount})
            </a>
            <button
              type="button"
              onClick={() => onOpenTracking(createdOrder?.code || '')}
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Rastrear Pedido
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBackToRotaJusta}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{backButtonLabel}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 space-y-8">
        {isLoading ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-14 flex flex-col items-center justify-center gap-3 text-sm text-zinc-600">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" aria-hidden="true" />
            <span>Carregando vitrine da loja...</span>
          </div>
        ) : loadError || !storeData ? (
          <div className="rounded-xl border border-red-200 bg-white p-10 text-center space-y-4">
            <p className="font-display text-lg font-bold text-zinc-900">
              {loadError || 'Vitrine indisponível'}
            </p>
            <button
              type="button"
              onClick={onBackToRotaJusta}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{backButtonLabel}</span>
            </button>
          </div>
        ) : createdOrder ? (
          /* ================================================================= */
          /* TELA DE PEDIDO CRIADO: #RS-XXXX + ITENS + QR CODE PIX + RASTREIO  */
          /* ================================================================= */
          (() => {
            const summary = createdOrder.storefrontOrder;
            const isPlatformPix =
              createdOrder.paymentMethod === 'pix_plataforma';
            const pixKeyToUse = isPlatformPix
              ? storeData.platformPixKey
              : storeData.merchant.pixKey || storeData.platformPixKey;
            const pixRecipient =
              isPlatformPix || !storeData.merchant.pixKey
                ? 'RotaJusta Porto Alegre'
                : storeDisplayName;
            const trackingUrl = buildTrackingUrl(createdOrder.code);
            const storePhone = extractBrPhoneDigits(storeData.merchant.phone);
            const whatsappMsg = `Olá *${storeDisplayName}*! Acabei de fazer o pedido *${createdOrder.code}* na sua vitrine do RotaJusta:\n${
              summary
                ? summary.items
                    .map(
                      (i) =>
                        `• ${i.quantity}x ${i.name} (${formatBRL(i.lineTotal)})`
                    )
                    .join('\n')
                : ''
            }\nTotal (produtos + frete): *${formatBRL(
              summary?.grandTotal ?? createdOrder.grossTotal
            )}*\nAcompanhe a entrega: ${trackingUrl}`;
            const whatsappHref = buildWhatsAppUrl({
              phone: storePhone,
              message: whatsappMsg,
            });

            return (
              <section className="mx-auto max-w-3xl space-y-6">
                <div className="rounded-xl border border-emerald-200 bg-white p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-emerald-700">
                        Solicitação de entrega criada automaticamente
                      </p>
                      <h1 className="font-display text-2xl font-bold text-zinc-950">
                        Pedido {createdOrder.code} confirmado
                      </h1>
                      <p className="text-xs text-zinc-600">
                        {storeDisplayName} · Entrega para{' '}
                        {createdOrder.stops[0]?.address} (
                        {createdOrder.stops[0]?.neighborhood})
                      </p>
                    </div>
                    <span className="rounded-lg bg-zinc-950 px-3 py-1.5 font-mono text-sm font-black text-white">
                      {createdOrder.code}
                    </span>
                  </div>

                  {summary && (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-2.5 text-xs">
                      <p className="font-semibold text-zinc-900">
                        Resumo dos Itens ({createdOrder.code})
                      </p>
                      <ul className="divide-y divide-zinc-200/80">
                        {summary.items.map((item) => (
                          <li
                            key={item.productId}
                            className="flex items-center justify-between py-1.5"
                          >
                            <span className="text-zinc-800">
                              <strong className="font-mono">
                                {item.quantity}x
                              </strong>{' '}
                              {item.name}
                            </span>
                            <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                              {formatBRL(item.lineTotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-zinc-200 pt-2 space-y-1">
                        <div className="flex justify-between text-zinc-600">
                          <span>Subtotal dos produtos</span>
                          <span className="font-mono tabular-nums">
                            {formatBRL(summary.productsSubtotal)}
                          </span>
                        </div>
                        <div className="flex justify-between text-zinc-600">
                          <span>
                            Frete RotaJusta ({createdOrder.distanceKm ?? 3} km ·{' '}
                            {formatShortVehicleLabel(
                              createdOrder.requestedVehicle || 'Moto'
                            )}
                            )
                          </span>
                          <span className="font-mono tabular-nums">
                            {formatBRL(summary.freightTotal)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-zinc-950 pt-1">
                          <span>Total do Pedido</span>
                          <span className="font-mono tabular-nums text-emerald-700">
                            {formatBRL(summary.grandTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <PixQrCodeSettlement
                    orderCode={createdOrder.code}
                    amount={summary?.grandTotal ?? createdOrder.grossTotal}
                    recipientName={pixRecipient}
                    pixKey={pixKeyToUse}
                    paymentStatus={createdOrder.paymentStatus}
                    viewerRole="merchant"
                    isConfirming={isConfirmingPixSent}
                    onConfirmAction={handleConfirmPixSent}
                    confirmButtonLabel="Confirmar Pagamento Pix Enviado"
                  />

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => onOpenTracking(createdOrder.code)}
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      <span>
                        Acompanhar Entrega em Tempo Real ({createdOrder.code})
                      </span>
                    </button>

                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-green-700 whitespace-nowrap"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      <span>Enviar no WhatsApp da Loja</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>

                    <button
                      type="button"
                      onClick={() => setCreatedOrder(null)}
                      className="min-h-[44px] rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
                    >
                      Fazer Novo Pedido
                    </button>
                  </div>
                </div>
              </section>
            );
          })()
        ) : (
          <>
            {/* Storefront Hero / Info Strip */}
            <section className="rounded-xl border border-zinc-200 bg-white p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>Vitrine Local RotaJusta</span>
                  <span aria-hidden="true">·</span>
                  <span>{pickupLocation.neighborhood}, Porto Alegre/RS</span>
                  {storeData.merchant.ratingCount ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <RatingBadge
                        avg={storeData.merchant.ratingAvg}
                        count={storeData.merchant.ratingCount}
                        compact
                      />
                    </>
                  ) : null}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
                  {storeDisplayName}
                </h1>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  {storeData.storefront.storeDescription ||
                    `Retirada em ${pickupLocation.address} (${pickupLocation.neighborhood}) com entrega urbana rápida e frete justo calculado em tempo real.`}
                </p>
              </div>

              <a
                href="#vitrine-checkout"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-950 px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-zinc-800 whitespace-nowrap shrink-0"
              >
                <ShoppingBag className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <span className="tabular-nums">
                  Carrinho ({totalCartItemsCount}) · {formatBRL(productsSubtotal)}
                </span>
              </a>
            </section>

            {/* Catálogo + Carrinho / Checkout em Split */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
              {/* Catálogo de Produtos */}
              <section
                id="vitrine-catalogo"
                className="lg:col-span-7 space-y-5 scroll-mt-24"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1 max-w-sm">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar produto na loja..."
                      className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1">
                    {(['Todos', 'Bike', 'Moto', 'Carro Pequeno (Passeio)', 'Utilitário / Picape / Van'] as const).map(
                      (v) => {
                        const label =
                          v === 'Todos' ? 'Todos' : formatShortVehicleLabel(v);
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setVehicleFilter(v)}
                            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                              vehicleFilter === v
                                ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                                : 'text-zinc-600 hover:text-zinc-900'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center space-y-2">
                    <Store
                      className="mx-auto h-8 w-8 text-zinc-300"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-zinc-900">
                      Nenhum produto disponível no momento
                    </p>
                    <p className="text-xs text-zinc-500">
                      {activeProducts.length === 0
                        ? 'O lojista ainda está montando o catálogo desta vitrine.'
                        : 'Ajuste o filtro ou a busca para ver outros itens.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {filteredProducts.map((product) => {
                      const inCart = cart[product.id];
                      return (
                        <article
                          key={product.id}
                          className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
                        >
                          <div>
                            <div className="aspect-[4/3] w-full bg-zinc-100 overflow-hidden">
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 text-zinc-400">
                                  <Package className="h-8 w-8" aria-hidden="true" />
                                  <span className="text-xs font-medium px-3 text-center">
                                    {product.name}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="p-4 space-y-1.5">
                              <p className="text-xs text-zinc-500">
                                Entrega recomendada:{' '}
                                {formatShortVehicleLabel(
                                  product.recommendedVehicle
                                )}
                              </p>
                              <h2 className="font-display text-base font-semibold text-zinc-900 leading-snug">
                                {product.name}
                              </h2>
                              {product.description && (
                                <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
                                  {product.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
                            <span className="font-mono text-base font-bold text-zinc-950 tabular-nums">
                              {formatBRL(product.price)}
                            </span>

                            {inCart ? (
                              <div className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-1">
                                <button
                                  type="button"
                                  aria-label={`Diminuir quantidade de ${product.name}`}
                                  onClick={() =>
                                    handleUpdateCartQuantity(product.id, -1)
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-zinc-800 hover:bg-zinc-100"
                                >
                                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                                <span className="w-6 text-center font-mono text-xs font-bold text-emerald-900 tabular-nums">
                                  {inCart.quantity}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Aumentar quantidade de ${product.name}`}
                                  onClick={() =>
                                    handleUpdateCartQuantity(product.id, 1)
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddToCart(product)}
                                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Adicionar</span>
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Carrinho + CEP / Endereço + Cálculo Automático de Frete + Checkout */}
              <aside
                id="vitrine-checkout"
                className="lg:col-span-5 rounded-xl border border-zinc-200 bg-white p-5 space-y-5 lg:sticky lg:top-20 scroll-mt-24"
              >
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag
                      className="h-4 w-4 text-emerald-600"
                      aria-hidden="true"
                    />
                    <h2 className="font-display text-base font-bold text-zinc-900">
                      Seu Pedido &amp; Frete em Tempo Real
                    </h2>
                  </div>
                  <span className="font-mono text-xs font-semibold text-zinc-500 tabular-nums">
                    {totalCartItemsCount} item(ns)
                  </span>
                </div>

                {cartItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center text-xs text-zinc-500">
                    Adicione produtos do catálogo ao lado para calcular o frete
                    pelo seu CEP e fechar o pedido via Pix.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 text-xs">
                    {cartItems.map(({ product, quantity }) => (
                      <li
                        key={product.id}
                        className="flex items-center justify-between gap-2 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-zinc-900 truncate">
                            {product.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 font-mono tabular-nums">
                            {quantity}x {formatBRL(product.price)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
                            <button
                              type="button"
                              aria-label={`Remover 1 ${product.name}`}
                              onClick={() =>
                                handleUpdateCartQuantity(product.id, -1)
                              }
                              className="flex h-6 w-6 items-center justify-center rounded text-zinc-700 hover:bg-white"
                            >
                              <Minus className="h-3 w-3" aria-hidden="true" />
                            </button>
                            <span className="w-5 text-center font-mono text-xs font-bold tabular-nums">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`Adicionar 1 ${product.name}`}
                              onClick={() =>
                                handleUpdateCartQuantity(product.id, 1)
                              }
                              className="flex h-6 w-6 items-center justify-center rounded text-zinc-700 hover:bg-white"
                            >
                              <Plus className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>

                          <span className="w-16 text-right font-mono font-bold text-zinc-900 tabular-nums">
                            {formatBRL(product.price * quantity)}
                          </span>

                          <button
                            type="button"
                            aria-label={`Excluir ${product.name} do carrinho`}
                            onClick={() =>
                              handleUpdateCartQuantity(product.id, -quantity)
                            }
                            className="p-1 text-zinc-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(e) => void handleCheckoutSubmit(e)}
                  className="space-y-4 border-t border-zinc-100 pt-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="checkout-name"
                        className="block text-xs font-semibold text-zinc-700 mb-1"
                      >
                        Seu Nome Completo
                      </label>
                      <input
                        id="checkout-name"
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ex: Juliana Martins"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="checkout-phone"
                        className="block text-xs font-semibold text-zinc-700 mb-1"
                      >
                        WhatsApp para Avisos
                      </label>
                      <input
                        id="checkout-phone"
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="(51) 99999-0000"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* CEP + Endereço de Entrega com Busca Automática */}
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5">
                    <AddressAutocompleteFields
                      idPrefix="vitrine-dest"
                      sectionLabel="Endereço de Entrega (digite o CEP para buscar)"
                      value={destAddr}
                      onChange={(next) => setDestAddr(next)}
                      compact
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="checkout-note"
                      className="block text-xs font-semibold text-zinc-700 mb-1"
                    >
                      Observação para a loja ou entregador (opcional)
                    </label>
                    <input
                      id="checkout-note"
                      type="text"
                      value={deliveryNote}
                      onChange={(e) => setDeliveryNote(e.target.value)}
                      placeholder="Ex: Interfone 302, chamar na portaria"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Forma de Pagamento Pix
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('pix_direto')}
                        className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          paymentMethod === 'pix_direto'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        Pix Direto à Loja
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('pix_plataforma')}
                        className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                          paymentMethod === 'pix_plataforma'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        Pix Plataforma RotaJusta
                      </button>
                    </div>
                  </div>

                  {/* Resumo em Tempo Real: Produtos + Frete RotaJusta */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-zinc-700">
                      <span>Subtotal dos produtos</span>
                      <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                        {formatBRL(productsSubtotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-zinc-700">
                      <span className="inline-flex items-center gap-1">
                        <Route className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                        <span>
                          Frete RotaJusta (
                          {hasDestinationFilled
                            ? `${calculatedDistanceKm} km`
                            : 'estimativa inicial 3 km'}{' '}
                          · {formatVehicleModalDisplayName(recommendedVehicle)})
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                        {formatBRL(freightPricing.grossTotal)}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-500">
                      Origem: {pickupLocation.neighborhood} → Destino:{' '}
                      {destAddr.neighborhood.trim() || 'Informe CEP/endereço'}
                    </p>

                    <div className="flex items-center justify-between border-t border-emerald-200 pt-2.5">
                      <span className="font-display text-sm font-bold text-zinc-950">
                        Total (Produtos + Frete)
                      </span>
                      <span className="font-mono text-lg font-extrabold text-emerald-700 tabular-nums">
                        {formatBRL(grandTotal)}
                      </span>
                    </div>
                  </div>

                  {checkoutError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                      {checkoutError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || cartItems.length === 0}
                    className="min-h-[46px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {isSubmitting
                        ? 'Gerando pedido #RS-XXXX...'
                        : `Finalizar Pedido e Gerar Pix (${formatBRL(grandTotal)})`}
                    </span>
                  </button>
                </form>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
