import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Database,
  HeartHandshake,
  Loader2,
  LogIn,
  MapPin,
  Minus,
  Package,
  Plus,
  Route,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  User,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import heroPoaImage from '../assets/images/rotajusta_hero_poa_1795704483725.jpg';
import { resolvePortoAlegreCoordinates } from '../constants/portoAlegre';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  createDeliveryInSupabase,
  fetchOnlineCourierCountsByVehicleInSupabase,
  fetchPublicLandingCatalogInSupabase,
  PublicActiveStorefrontListing,
  updateDeliveryPaymentStatusInSupabase,
} from '../lib/supabaseService';
import {
  CargoSize,
  Order,
  OrderType,
  PixPaymentMethod,
  StorefrontOrderSummary,
  StoreProduct,
  VehicleType,
} from '../types';
import {
  calculateUrbanDistanceKm,
  formatFullAddressLine,
  parseFullAddressLine,
  StructuredAddressValue,
} from '../utils/addressLookup';
import { formatPickupCode } from '../utils/pickupCode';
import {
  calculatePricing,
  formatBRL,
  formatVehicleModalDisplayName,
  getCompatibleVehiclesForOrderType,
  PROGRESSIVE_PLATFORM_FEE_NOTE,
} from '../utils/pricing';
import { getTomorrowDateInputValue } from '../utils/schedule';
import {
  formatShortVehicleLabel,
  formatStorefrontItemsSummaryText,
  isSafeImageUrl,
  resolveRecommendedVehicleForCart,
} from '../utils/storefront';
import {
  createEmptyOnlineCountsByVehicle,
  OnlineCourierCountsByVehicle,
  resolveVehicleWithOnlineFallback,
  VEHICLE_CATEGORIES,
} from '../utils/vehicleCompatibility';
import { AddressAutocompleteFields } from './AddressAutocompleteFields';
import { RegProfileChoice } from './AuthScreen';
import { LegalDocTab, LegalModal } from './LegalModal';
import { PixQrCodeSettlement } from './PixQrCodeSettlement';
import { PWAInstallButton } from './PWAInstallButton';
import { RatingBadge } from './RatingWidgets';

interface LandingPageProps {
  onlineCouriersCount: number;
  isLoadingOnlineCount: boolean;
  isDatabaseEmpty: boolean;
  isCheckingEmpty: boolean;
  isSeeding: boolean;
  dbError: string | null;
  onOpenLogin: () => void;
  onOpenRegister: (presetChoice: RegProfileChoice) => void;
  onOpenTracking: (code?: string) => void;
  onOpenStorefront: (merchantId: string, productId?: string) => void;
  onSeedTestData: () => Promise<void>;
}

const FREIGHT_CARGO_EXAMPLES = [
  {
    label: 'Geladeira / Eletrodoméstico',
    size: 'grande' as CargoSize,
    helper: true,
    note: 'Geladeira duplex, fogão ou máquina de lavar',
  },
  {
    label: 'Sofá / Móveis',
    size: 'grande' as CargoSize,
    helper: true,
    note: 'Sofá 2–3 lugares, guarda-roupa desmontado ou mesa',
  },
  {
    label: 'Caixas / Mudança Leve',
    size: 'medio' as CargoSize,
    helper: false,
    note: 'Caixas organizadoras, compras ou equipamentos',
  },
];

export function LandingPage({
  onlineCouriersCount,
  isLoadingOnlineCount,
  isDatabaseEmpty,
  isCheckingEmpty,
  isSeeding,
  dbError,
  onOpenLogin,
  onOpenRegister,
  onOpenTracking,
  onOpenStorefront,
  onSeedTestData,
}: LandingPageProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [failedProductImgIds, setFailedProductImgIds] = useState<
    Record<string, boolean>
  >({});
  const [legalModalTab, setLegalModalTab] = useState<LegalDocTab | null>(null);
  const [trackCodeDraft, setTrackCodeDraft] = useState('');

  // Public Stores Showcase ("Comércio Local no RotaJusta" via public.products)
  const [storefronts, setStorefronts] = useState<
    PublicActiveStorefrontListing[]
  >([]);
  const [platformPixKey, setPlatformPixKey] = useState<string | null>(null);
  const [isLoadingStorefronts, setIsLoadingStorefronts] = useState(true);
  const [storefrontLoadError, setStorefrontLoadError] = useState<string | null>(
    null
  );
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
  const [storeVehicleFilter, setStoreVehicleFilter] = useState<
    'Todos' | VehicleType
  >('Todos');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('Todos');

  // Online courier availability by category (for quick freight calculator & Home store checkout)
  const [onlineCountsByVehicle, setOnlineCountsByVehicle] =
    useState<OnlineCourierCountsByVehicle>(() =>
      createEmptyOnlineCountsByVehicle()
    );
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

  // Integrated Cart & Checkout right inside "Comércio Local no RotaJusta"
  const [homeCartMerchantId, setHomeCartMerchantId] = useState<string | null>(
    null
  );
  const [homeCart, setHomeCart] = useState<
    Record<string, { product: StoreProduct; quantity: number }>
  >({});
  const [pendingStoreSwitch, setPendingStoreSwitch] = useState<{
    store: PublicActiveStorefrontListing;
    product: StoreProduct;
  } | null>(null);
  const [cartCustomerName, setCartCustomerName] = useState('');
  const [cartCustomerPhone, setCartCustomerPhone] = useState('');
  const [cartDeliveryNote, setCartDeliveryNote] = useState('');
  const [cartPaymentMethod, setCartPaymentMethod] =
    useState<PixPaymentMethod>('pix_direto');
  const [cartDestAddr, setCartDestAddr] = useState<StructuredAddressValue>({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: 'Centro Histórico',
    cityUf: 'Porto Alegre / RS',
  });
  const [cartManualVehicle, setCartManualVehicle] =
    useState<VehicleType | null>(null);
  const [cartDeliveryArrangement, setCartDeliveryArrangement] = useState<
    'imediata' | 'agendada_loja'
  >('imediata');
  const [cartCheckoutError, setCartCheckoutError] = useState('');
  const [isSubmittingCartOrder, setIsSubmittingCartOrder] = useState(false);
  const [createdHomeOrder, setCreatedHomeOrder] = useState<Order | null>(null);
  const [createdHomeOrderStore, setCreatedHomeOrderStore] =
    useState<PublicActiveStorefrontListing | null>(null);
  const [isConfirmingHomePix, setIsConfirmingHomePix] = useState(false);

  // Interactive CEP & Vehicle Category Calculator
  const [isFreightCalcOpen, setIsFreightCalcOpen] = useState(false);
  const [calcServiceType, setCalcServiceType] = useState<
    Extract<OrderType, 'frete' | 'rapida'>
  >('frete');
  const [calcVehicle, setCalcVehicle] = useState<VehicleType>(
    'Utilitário / Picape / Van'
  );
  const [calcCargoPreset, setCalcCargoPreset] = useState(
    'Geladeira / Eletrodoméstico'
  );
  const [calcCargoSize, setCalcCargoSize] = useState<CargoSize>('grande');
  const [calcIncludeHelper, setCalcIncludeHelper] = useState<boolean>(true);
  const [calcPickupAddr, setCalcPickupAddr] = useState<StructuredAddressValue>(
    () => parseFullAddressLine('Rua dos Andradas, 1234', 'Centro Histórico')
  );
  const [calcDestAddr, setCalcDestAddr] = useState<StructuredAddressValue>(() =>
    parseFullAddressLine('Av. Getúlio Vargas, 890', 'Menino Deus')
  );

  const loadPublicLandingShowcase = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoadingStorefronts(false);
      setIsLoadingAvailability(false);
      return;
    }
    setStorefrontLoadError(null);
    try {
      const [catalogData, countsMap] = await Promise.all([
        fetchPublicLandingCatalogInSupabase(),
        fetchOnlineCourierCountsByVehicleInSupabase().catch(() =>
          createEmptyOnlineCountsByVehicle()
        ),
      ]);
      setStorefronts(catalogData.listings);
      setPlatformPixKey(catalogData.platformPixKey);
      setOnlineCountsByVehicle(countsMap);
    } catch (err) {
      setStorefrontLoadError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar as lojas locais agora.'
      );
    } finally {
      setIsLoadingStorefronts(false);
      setIsLoadingAvailability(false);
    }
  }, []);

  useEffect(() => {
    void loadPublicLandingShowcase();
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('rotajusta-landing-storefronts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void loadPublicLandingShowcase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          void loadPublicLandingShowcase();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadPublicLandingShowcase]);

  const onlineText = isLoadingOnlineCount
    ? 'Verificando entregadores online em Porto Alegre...'
    : onlineCouriersCount === 1
    ? '1 entregador online em Porto Alegre'
    : `${onlineCouriersCount} entregadores online em Porto Alegre`;

  const scrollToSection = (sectionId: string) => {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleOpenFreightCalculator = (
    preferredType: Extract<OrderType, 'frete' | 'rapida'> = 'frete'
  ) => {
    setCalcServiceType(preferredType);
    if (preferredType === 'frete') {
      setCalcVehicle('Utilitário / Picape / Van');
    } else {
      const resolved = resolveVehicleWithOnlineFallback({
        preferredVehicle: 'Moto',
        onlineCounts: onlineCountsByVehicle,
        allowedVehicles: getCompatibleVehiclesForOrderType('rapida'),
      });
      setCalcVehicle(resolved.selectedVehicle);
    }
    setIsFreightCalcOpen(true);
    window.setTimeout(() => {
      scrollToSection('calculo-frete-cep');
    }, 60);
  };

  const calcAllowedVehicles = useMemo(
    () => getCompatibleVehiclesForOrderType(calcServiceType),
    [calcServiceType]
  );

  const calcDistanceKm = useMemo(() => {
    const pickupLine = formatFullAddressLine(calcPickupAddr);
    const pickupNb = calcPickupAddr.neighborhood.trim() || 'Centro Histórico';
    const destLine = formatFullAddressLine(calcDestAddr);
    const destNb = calcDestAddr.neighborhood.trim() || 'Menino Deus';

    const pCoords =
      calcPickupAddr.lat !== undefined && calcPickupAddr.lng !== undefined
        ? { lat: calcPickupAddr.lat, lng: calcPickupAddr.lng }
        : resolvePortoAlegreCoordinates(pickupLine, pickupNb, 0);

    const dCoords =
      calcDestAddr.lat !== undefined && calcDestAddr.lng !== undefined
        ? { lat: calcDestAddr.lat, lng: calcDestAddr.lng }
        : resolvePortoAlegreCoordinates(destLine, destNb, 1);

    return calculateUrbanDistanceKm(
      pCoords.lat,
      pCoords.lng,
      dCoords.lat,
      dCoords.lng
    );
  }, [calcPickupAddr, calcDestAddr]);

  const calcPricing = useMemo(
    () =>
      calculatePricing(
        calcServiceType,
        calcDistanceKm,
        1,
        calcServiceType === 'frete'
          ? {
              cargoSize: calcCargoSize,
              includeHelper: calcIncludeHelper,
            }
          : undefined,
        calcVehicle
      ),
    [
      calcServiceType,
      calcDistanceKm,
      calcCargoSize,
      calcIncludeHelper,
      calcVehicle,
    ]
  );

  const filteredStorefronts = useMemo(() => {
    const q = storeSearchQuery.trim().toLowerCase();
    return storefronts
      .filter(
        (store) =>
          selectedStoreFilter === 'Todos' ||
          store.merchantId === selectedStoreFilter
      )
      .map((store) => {
        const matchingProducts = store.activeProducts.filter((product) => {
          if (
            storeVehicleFilter !== 'Todos' &&
            product.recommendedVehicle !== storeVehicleFilter
          ) {
            return false;
          }
          if (!q) return true;
          return (
            store.storeName.toLowerCase().includes(q) ||
            store.neighborhood.toLowerCase().includes(q) ||
            product.name.toLowerCase().includes(q) ||
            product.description.toLowerCase().includes(q)
          );
        });
        return {
          ...store,
          visibleProducts: matchingProducts,
        };
      })
      .filter((s) => s.visibleProducts.length > 0);
  }, [storefronts, selectedStoreFilter, storeSearchQuery, storeVehicleFilter]);

  const flattenedCatalogItems = useMemo(() => {
    const items: Array<{
      store: PublicActiveStorefrontListing;
      product: StoreProduct;
    }> = [];
    for (const store of filteredStorefronts) {
      for (const product of store.visibleProducts) {
        items.push({ store, product });
      }
    }
    return items;
  }, [filteredStorefronts]);

  // Integrated Home Cart derived state
  const activeCartStore = useMemo(
    () =>
      storefronts.find((s) => s.merchantId === homeCartMerchantId) || null,
    [storefronts, homeCartMerchantId]
  );

  const homeCartItems = useMemo(() => Object.values(homeCart), [homeCart]);

  const homeCartCount = useMemo(
    () => homeCartItems.reduce((sum, entry) => sum + entry.quantity, 0),
    [homeCartItems]
  );

  const homeCartProductsSubtotal = useMemo(
    () =>
      Number(
        homeCartItems
          .reduce(
            (sum, entry) => sum + entry.product.price * entry.quantity,
            0
          )
          .toFixed(2)
      ),
    [homeCartItems]
  );

  const cartRecommendedVehicle = useMemo(
    () => resolveRecommendedVehicleForCart(homeCartItems),
    [homeCartItems]
  );

  const cartAllowedVehicles = useMemo(() => {
    const startIdx = VEHICLE_CATEGORIES.indexOf(cartRecommendedVehicle);
    return startIdx >= 0
      ? VEHICLE_CATEGORIES.slice(startIdx)
      : VEHICLE_CATEGORIES;
  }, [cartRecommendedVehicle]);

  useEffect(() => {
    setCartManualVehicle((prev) => {
      if (!prev) return null;
      if (!cartAllowedVehicles.includes(prev)) return null;
      if (!isLoadingAvailability && (onlineCountsByVehicle[prev] || 0) === 0) {
        return null;
      }
      return prev;
    });
  }, [cartAllowedVehicles, onlineCountsByVehicle, isLoadingAvailability]);

  const cartVehicleAvailability = useMemo(
    () =>
      resolveVehicleWithOnlineFallback({
        preferredVehicle: cartManualVehicle || cartRecommendedVehicle,
        onlineCounts: onlineCountsByVehicle,
        allowedVehicles: cartAllowedVehicles,
      }),
    [
      cartManualVehicle,
      cartRecommendedVehicle,
      onlineCountsByVehicle,
      cartAllowedVehicles,
    ]
  );

  const cartEffectiveVehicle = isLoadingAvailability
    ? cartManualVehicle || cartRecommendedVehicle
    : cartVehicleAvailability.selectedVehicle;

  const isCartAnyOnlineAvailable = cartVehicleAvailability.totalOnlineAll > 0;
  const cartMustOfferScheduledFallback =
    !isLoadingAvailability &&
    (cartVehicleAvailability.totalOnlineAll === 0 ||
      !cartVehicleAvailability.hasAnyAvailableInAllowed);

  useEffect(() => {
    if (cartMustOfferScheduledFallback) {
      setCartDeliveryArrangement('agendada_loja');
    } else {
      setCartDeliveryArrangement('imediata');
    }
  }, [cartMustOfferScheduledFallback]);

  const cartHasDestFilled = Boolean(
    cartDestAddr.street.trim() || cartDestAddr.neighborhood.trim()
  );

  const cartDistanceKm = useMemo(() => {
    if (!activeCartStore || !cartHasDestFilled) return 3.0;
    const destLine = formatFullAddressLine(cartDestAddr);
    const destNb = cartDestAddr.neighborhood.trim() || 'Centro Histórico';
    const destCoords =
      cartDestAddr.lat !== undefined && cartDestAddr.lng !== undefined
        ? { lat: cartDestAddr.lat, lng: cartDestAddr.lng }
        : resolvePortoAlegreCoordinates(destLine, destNb, 1);

    return calculateUrbanDistanceKm(
      activeCartStore.storeLat,
      activeCartStore.storeLng,
      destCoords.lat,
      destCoords.lng
    );
  }, [activeCartStore, cartHasDestFilled, cartDestAddr]);

  const cartFreightPricing = useMemo(
    () =>
      calculatePricing(
        'rapida',
        cartDistanceKm,
        1,
        undefined,
        cartEffectiveVehicle
      ),
    [cartDistanceKm, cartEffectiveVehicle]
  );

  const cartGrandTotal = useMemo(
    () =>
      Number(
        (homeCartProductsSubtotal + cartFreightPricing.grossTotal).toFixed(2)
      ),
    [homeCartProductsSubtotal, cartFreightPricing.grossTotal]
  );

  const handleAddHomeProductToCart = (
    store: PublicActiveStorefrontListing,
    product: StoreProduct
  ) => {
    setCartCheckoutError('');
    setCreatedHomeOrder(null);
    setCreatedHomeOrderStore(null);

    if (
      homeCartMerchantId &&
      homeCartMerchantId !== store.merchantId &&
      Object.keys(homeCart).length > 0
    ) {
      setPendingStoreSwitch({ store, product });
      document
        .getElementById('home-vitrine-checkout')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    setPendingStoreSwitch(null);
    setHomeCartMerchantId(store.merchantId);
    setHomeCart((prev) => {
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

  const handleConfirmStoreSwitch = () => {
    if (!pendingStoreSwitch) return;
    const { store, product } = pendingStoreSwitch;
    setHomeCartMerchantId(store.merchantId);
    setHomeCart({
      [product.id]: {
        product,
        quantity: 1,
      },
    });
    setPendingStoreSwitch(null);
    setCartCheckoutError('');
  };

  const handleUpdateHomeCartQuantity = (productId: string, delta: number) => {
    setHomeCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        if (Object.keys(copy).length === 0) {
          setHomeCartMerchantId(null);
        }
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

  const handleHomeCartCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCartCheckoutError('');

    if (!activeCartStore || homeCartItems.length === 0) {
      setCartCheckoutError(
        'Adicione pelo menos 1 produto ao carrinho antes de fechar o pedido.'
      );
      return;
    }
    if (!cartCustomerName.trim()) {
      setCartCheckoutError('Informe seu nome completo para a entrega.');
      return;
    }
    if (!cartDestAddr.street.trim()) {
      setCartCheckoutError(
        'Informe o CEP ou a rua e número de entrega em Porto Alegre.'
      );
      return;
    }

    const formattedDestAddress = formatFullAddressLine(cartDestAddr);
    const destNb = cartDestAddr.neighborhood.trim() || 'Porto Alegre';
    const destCoords =
      cartDestAddr.lat !== undefined && cartDestAddr.lng !== undefined
        ? { lat: cartDestAddr.lat, lng: cartDestAddr.lng }
        : resolvePortoAlegreCoordinates(formattedDestAddress, destNb, 1);

    const storefrontOrder: StorefrontOrderSummary = {
      items: homeCartItems.map((entry) => ({
        productId: entry.product.id,
        name: entry.product.name,
        quantity: entry.quantity,
        unitPrice: entry.product.price,
        lineTotal: Number((entry.product.price * entry.quantity).toFixed(2)),
      })),
      productsSubtotal: homeCartProductsSubtotal,
      freightTotal: cartFreightPricing.grossTotal,
      grandTotal: cartGrandTotal,
      customerName: cartCustomerName.trim(),
      customerPhone: cartCustomerPhone.trim() || undefined,
    };

    const itemsText = formatStorefrontItemsSummaryText(storefrontOrder);
    const isScheduledWithStore =
      cartMustOfferScheduledFallback &&
      cartDeliveryArrangement === 'agendada_loja';
    const noteCombined = [
      itemsText,
      isScheduledWithStore ? 'Entrega agendada / Combinar com a loja' : '',
      cartDeliveryNote.trim(),
    ]
      .filter(Boolean)
      .join(' · ');

    const newOrderId = crypto.randomUUID();
    const stopId = crypto.randomUUID();
    const tomorrowDate = getTomorrowDateInputValue();

    const newOrder: Order = {
      id: newOrderId,
      code: formatPickupCode(newOrderId),
      type: 'rapida',
      requestedVehicle: cartEffectiveVehicle,
      flowDirection: 'enviar',
      pickupSchedule: isScheduledWithStore
        ? {
            mode: 'agendada',
            readyAt: `${tomorrowDate}T09:00`,
            deadlineAt: `${tomorrowDate}T18:00`,
          }
        : { mode: 'imediata' },
      merchantId: activeCartStore.merchantId,
      merchantName: activeCartStore.storeName,
      pickupAddress: activeCartStore.storeAddress,
      pickupNeighborhood: activeCartStore.neighborhood,
      pickupLat: activeCartStore.storeLat,
      pickupLng: activeCartStore.storeLng,
      destinationNeighborhood: destNb,
      distanceKm: cartDistanceKm,
      packageCount: 1,
      storefrontOrder,
      stops: [
        {
          id: stopId,
          pickupCode: formatPickupCode(stopId),
          sequence: 1,
          address: formattedDestAddress,
          neighborhood: destNb,
          expectedRecipient: cartCustomerName.trim(),
          recipientNote: noteCombined,
          lat: destCoords.lat,
          lng: destCoords.lng,
          delivered: false,
        },
      ],
      grossTotal: cartFreightPricing.grossTotal,
      standardPlatformFee: cartFreightPricing.standardPlatformFee,
      basePayout: cartFreightPricing.basePayout,
      status: 'Aguardando',
      paymentMethod: cartPaymentMethod,
      paymentStatus: 'pendente_pagamento',
      createdAt: new Date().toISOString(),
    };

    setIsSubmittingCartOrder(true);
    try {
      const savedOrder = await createDeliveryInSupabase(newOrder);
      const enrichedOrder: Order = {
        ...savedOrder,
        storefrontOrder: savedOrder.storefrontOrder || storefrontOrder,
      };
      setCreatedHomeOrder(enrichedOrder);
      setCreatedHomeOrderStore(activeCartStore);
      setHomeCart({});
      setHomeCartMerchantId(null);
      setPendingStoreSwitch(null);
      document
        .getElementById('home-vitrine-checkout')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      setCartCheckoutError(
        err instanceof Error
          ? err.message
          : 'Não foi possível finalizar o pedido agora.'
      );
    } finally {
      setIsSubmittingCartOrder(false);
    }
  };

  const handleConfirmHomePixSent = async () => {
    if (!createdHomeOrder) return;
    setIsConfirmingHomePix(true);
    try {
      const updated = await updateDeliveryPaymentStatusInSupabase(
        createdHomeOrder.id,
        'pago_lojista'
      );
      setCreatedHomeOrder((prev) =>
        prev
          ? {
              ...updated,
              storefrontOrder: prev.storefrontOrder,
            }
          : updated
      );
    } finally {
      setIsConfirmingHomePix(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      {/* Top Navigation Bar (Strict 3-Zone Single-Row Contract) */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#inicio-rotajusta"
            className="inline-flex items-center gap-2 font-display text-lg sm:text-xl font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
              <Route className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>RotaJusta</span>
          </a>

          <nav
            aria-label="Navegação principal"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-zinc-600"
          >
            <button
              type="button"
              onClick={() => handleOpenFreightCalculator('frete')}
              className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pequeno Frete
            </button>
            <a
              href="#comercio-local"
              className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Comércio Local
            </a>
            <a
              href="#nossa-historia"
              className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Nossa História
            </a>
            <button
              type="button"
              onClick={onOpenLogin}
              className="hover:text-zinc-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Entrar
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenLogin}
              className="lg:hidden inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 whitespace-nowrap shrink-0"
            >
              <LogIn className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenRegister('pf_solicitante')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cadastrar-se</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 1. Hero + 3 Caminhos Diretos no Topo */}
        <section
          id="inicio-rotajusta"
          className="border-b border-zinc-200 bg-white"
        >
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 space-y-10">
            {/* Hero Split */}
            <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-zinc-600">
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Porto Alegre · RS</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span aria-live="polite" className="tabular-nums text-zinc-700">
                    {onlineText}
                  </span>
                </div>

                <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-zinc-950 leading-[1.12] text-balance max-w-2xl">
                  Pequenos fretes, entregas rápidas e lojas locais em Porto
                  Alegre.
                </h1>

                <p className="text-base sm:text-lg text-zinc-600 leading-relaxed max-w-xl">
                  Chame um utilitário para levar geladeira, sofá ou mudanças
                  leves, compre direto das vitrines de comércio do seu bairro ou
                  dirija recebendo via Pix sem taxas abusivas.
                </p>

                {/* Rastreamento Público + PWA Install */}
                <div className="space-y-3 pt-1">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onOpenTracking(trackCodeDraft.trim() || undefined);
                    }}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:flex-row sm:items-center max-w-lg"
                  >
                    <div className="relative flex-1">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={trackCodeDraft}
                        onChange={(e) => setTrackCodeDraft(e.target.value)}
                        placeholder="Rastrear pedido (#RS-XXXX)"
                        aria-label="Código do pedido para rastreamento público"
                        className="w-full rounded-lg border border-zinc-300 bg-white pl-8 pr-3 py-2 font-mono text-xs font-semibold uppercase text-zinc-900 placeholder:normal-case placeholder:font-normal focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Rastrear Pedido</span>
                    </button>
                  </form>

                  <div className="flex flex-wrap items-center gap-3">
                    <PWAInstallButton />
                    <a
                      href="#comercio-local"
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline underline-offset-4 whitespace-nowrap"
                    >
                      Explorar lojas e produtos locais ↓
                    </a>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 flex flex-col">
                <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm">
                  {!heroImgFailed ? (
                    <img
                      src={heroPoaImage}
                      alt="Entregadora em veículo elétrico recolhendo encomendas em comércio local de rua arborizada em Porto Alegre"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="aspect-video lg:aspect-auto lg:flex-1 w-full object-cover min-h-[240px]"
                    />
                  ) : (
                    <div className="aspect-video lg:flex-1 w-full bg-zinc-900 p-8 flex flex-col justify-between text-white">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                        <Route className="h-4 w-4" aria-hidden="true" />
                        <span>Porto Alegre · Conexão Direta</span>
                      </div>
                      <p className="font-display text-2xl font-bold max-w-md">
                        Do Centro Histórico à Zona Sul, fretes urbanos e lojas
                        de bairro com preço transparente.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 divide-y divide-zinc-800 bg-zinc-950 text-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="px-4 py-3.5">
                      <p className="text-[11px] font-medium text-zinc-400">
                        Pagamento Instantâneo
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-white">
                        Pix direto ao condutor
                      </p>
                    </div>
                    <div className="px-4 py-3.5">
                      <p className="text-[11px] font-medium text-zinc-400">
                        Preço Transparente
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-white">
                        Distância real por CEP
                      </p>
                    </div>
                    <div className="px-4 py-3.5">
                      <p className="text-[11px] font-medium text-zinc-400">
                        Mobilidade Limpa
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-emerald-400">
                        50% de desconto na taxa para bikes e veículos elétricos
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Três Caminhos Diretos e Bem Diferenciados */}
            <div
              id="caminhos-rotajusta"
              aria-label="Três caminhos diretos no RotaJusta"
              className="grid grid-cols-1 gap-6 lg:grid-cols-3"
            >
              {/* Caminho 1: Pedir Pequeno Frete ou Carreto */}
              <article className="flex flex-col justify-between rounded-2xl border-2 border-emerald-600 bg-emerald-50/60 p-6 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shrink-0">
                      <Truck className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-800">
                      Pessoa Física (CPF) ou Empresa
                    </span>
                  </div>

                  <h2 className="font-display text-xl font-bold text-zinc-950 leading-snug">
                    Pedir Pequeno Frete ou Carreto
                  </h2>

                  <p className="text-sm text-zinc-700 leading-relaxed">
                    Transporte de{' '}
                    <strong className="font-semibold text-zinc-950">
                      geladeira, sofá, eletrodomésticos, móveis, caixas
                    </strong>{' '}
                    e entregas rápidas em Porto Alegre, com simulação imediata
                    por CEP e escolha de veículo (Bike, Moto, Carro ou
                    Utilitário/Van).
                  </p>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenFreightCalculator('frete')}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                  >
                    <Calculator className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Calcular por CEP e Veículo</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenRegister('pf_solicitante')}
                    className="w-full text-center text-xs font-semibold text-emerald-900 hover:underline underline-offset-4 py-1"
                  >
                    Já quero cadastrar e publicar pedido →
                  </button>
                </div>
              </article>

              {/* Caminho 2: Cadastrar Minha Loja / Vitrine */}
              <article className="flex flex-col justify-between rounded-2xl border border-zinc-300 bg-white p-6 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900 shrink-0">
                      <Store className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-semibold text-zinc-600">
                      Vitrine Digital + Entrega
                    </span>
                  </div>

                  <h2 className="font-display text-xl font-bold text-zinc-950 leading-snug">
                    Cadastrar Minha Loja / Vitrine
                  </h2>

                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Crie sua vitrine online gratuita com catálogo de produtos,
                    link público compartilhável e checkout via Pix com cálculo
                    automático de frete RotaJusta e código{' '}
                    <span className="font-mono font-semibold text-zinc-900">
                      #RS-XXXX
                    </span>
                    .
                  </p>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenRegister('pj_lojista')}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-900 bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-100 whitespace-nowrap"
                  >
                    <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Cadastrar Loja / Vitrine</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('comercio-local')}
                    className="w-full text-center text-xs font-semibold text-zinc-600 hover:text-zinc-950 hover:underline underline-offset-4 py-1"
                  >
                    Ver vitrines ativas em POA ↓
                  </button>
                </div>
              </article>

              {/* Caminho 3: Quero Fazer Entregas */}
              <article className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-white space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shrink-0">
                      <Bike className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-400">
                      -50% Taxa Bike &amp; EV
                    </span>
                  </div>

                  <h2 className="font-display text-xl font-bold text-white leading-snug">
                    Quero Fazer Entregas
                  </h2>

                  <p className="text-sm text-zinc-300 leading-relaxed">
                    Rode de Bike, Moto, Carro ou Utilitário/Van recebendo direto
                    via Pix, filtrando entregas compatíveis com o seu veículo e
                    aproveitando{' '}
                    <strong className="font-semibold text-emerald-400">
                      50% de desconto na taxa operacional
                    </strong>{' '}
                    para bikes e veículos elétricos.
                  </p>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenRegister('pf_entregador')}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200 whitespace-nowrap"
                  >
                    <Bike className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>Quero Fazer Entregas</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className="w-full text-center text-xs font-semibold text-zinc-300 hover:text-white hover:underline underline-offset-4 py-1"
                  >
                    Já sou cadastrado · Entrar →
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Calculadora Interativa por CEP e Categoria de Veículo (aberta pelo caminho 1) */}
        {isFreightCalcOpen && (
          <section
            id="calculo-frete-cep"
            className="scroll-mt-20 border-b border-zinc-200 bg-emerald-50/40"
          >
            <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-emerald-700">
                    Simulador em Tempo Real · Porto Alegre (RS)
                  </p>
                  <h2 className="font-display text-2xl font-bold text-zinc-950">
                    Cálculo de Pequeno Frete e Entrega Rápida por CEP
                  </h2>
                  <p className="text-sm text-zinc-600">
                    Informe o CEP ou endereço de retirada e destino para ver o
                    valor transparente por categoria de veículo antes de publicar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFreightCalcOpen(false)}
                  className="self-start inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 whitespace-nowrap shrink-0"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Fechar simulador</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
                {/* Coluna Esquerda: Modalidade, CEP Origem/Destino e Veículo */}
                <div className="lg:col-span-7 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
                  <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-100 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCalcServiceType('frete');
                        setCalcVehicle('Utilitário / Picape / Van');
                      }}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        calcServiceType === 'frete'
                          ? 'bg-white text-zinc-950 shadow-2xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Pequeno Frete / Carreto (Móveis, Geladeira, Sofá)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalcServiceType('rapida');
                        const resolved = resolveVehicleWithOnlineFallback({
                          preferredVehicle: 'Moto',
                          onlineCounts: onlineCountsByVehicle,
                          allowedVehicles:
                            getCompatibleVehiclesForOrderType('rapida'),
                        });
                        setCalcVehicle(resolved.selectedVehicle);
                      }}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        calcServiceType === 'rapida'
                          ? 'bg-white text-zinc-950 shadow-2xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Entrega Rápida (Caixas, Sacolas, Documentos)
                    </button>
                  </div>

                  {calcServiceType === 'frete' && (
                    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
                      <span className="block text-xs font-semibold text-zinc-800">
                        Exemplos de Carga / Carreto
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {FREIGHT_CARGO_EXAMPLES.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setCalcCargoPreset(preset.label);
                              setCalcCargoSize(preset.size);
                              setCalcIncludeHelper(preset.helper);
                            }}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                              calcCargoPreset === preset.label
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-700">
                            Porte:
                          </span>
                          <button
                            type="button"
                            onClick={() => setCalcCargoSize('medio')}
                            className={`rounded-md border px-2.5 py-1 font-semibold ${
                              calcCargoSize === 'medio'
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-300 bg-white text-zinc-700'
                            }`}
                          >
                            Médio
                          </button>
                          <button
                            type="button"
                            onClick={() => setCalcCargoSize('grande')}
                            className={`rounded-md border px-2.5 py-1 font-semibold ${
                              calcCargoSize === 'grande'
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-300 bg-white text-zinc-700'
                            }`}
                          >
                            Grande / Volumoso
                          </button>
                        </div>

                        <label className="inline-flex items-center gap-2 font-semibold text-zinc-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={calcIncludeHelper}
                            onChange={(e) =>
                              setCalcIncludeHelper(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                          />
                          <span>Incluir ajudante para carga pesada</span>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                      <AddressAutocompleteFields
                        idPrefix="home-calc-pickup"
                        sectionLabel="1. CEP / Endereço de Coleta"
                        value={calcPickupAddr}
                        onChange={(next) => setCalcPickupAddr(next)}
                        compact
                      />
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                      <AddressAutocompleteFields
                        idPrefix="home-calc-dest"
                        sectionLabel="2. CEP / Endereço de Entrega"
                        value={calcDestAddr}
                        onChange={(next) => setCalcDestAddr(next)}
                        compact
                      />
                    </div>
                  </div>

                  {/* Categoria de Veículo com Contagem Online */}
                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-zinc-800">
                      3. Escolha a Categoria de Veículo
                    </span>
                    <div
                      className={`grid grid-cols-1 gap-2 ${
                        calcAllowedVehicles.length === 1
                          ? 'sm:grid-cols-1'
                          : 'sm:grid-cols-2'
                      }`}
                    >
                      {calcAllowedVehicles.map((vType) => {
                        const isSelected = calcVehicle === vType;
                        const onlineCount = onlineCountsByVehicle[vType] || 0;
                        const preview = calculatePricing(
                          calcServiceType,
                          calcDistanceKm,
                          1,
                          calcServiceType === 'frete'
                            ? {
                                cargoSize: calcCargoSize,
                                includeHelper: calcIncludeHelper,
                              }
                            : undefined,
                          vType
                        );
                        return (
                          <button
                            key={vType}
                            type="button"
                            onClick={() => setCalcVehicle(vType)}
                            className={`rounded-xl border p-3 text-left transition-colors ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                                : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold">
                                {formatVehicleModalDisplayName(vType)}
                              </span>
                              <span className="font-mono text-xs font-bold tabular-nums">
                                {formatBRL(preview.grossTotal)}
                              </span>
                            </div>
                            <p
                              className={`mt-1 text-[11px] font-medium ${
                                onlineCount > 0
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {onlineCount > 0
                                ? `${onlineCount} entregador(es) online agora`
                                : 'Sem entregadores online agora (agendamento disponível)'}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Coluna Direita: Resumo Transparente + Publicar como PF ou PJ */}
                <div className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-5">
                  <div className="border-b border-zinc-100 pb-3">
                    <p className="text-xs font-semibold text-emerald-700">
                      Estimativa Transparente · {calcDistanceKm} km em POA
                    </p>
                    <h3 className="font-display text-lg font-bold text-zinc-950">
                      {formatVehicleModalDisplayName(calcVehicle)}
                    </h3>
                  </div>

                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between text-zinc-600">
                      <span>Base (até {calcPricing.baseKm} km)</span>
                      <span className="font-mono font-medium text-zinc-900 tabular-nums">
                        {formatBRL(calcPricing.baseComponent)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-600">
                      <span>
                        Km adicional ({calcPricing.extraKm.toLocaleString('pt-BR')}{' '}
                        km × {formatBRL(calcPricing.perKmRate)}/km)
                      </span>
                      <span className="font-mono font-medium text-zinc-900 tabular-nums">
                        {formatBRL(calcPricing.extraDistanceComponent)}
                      </span>
                    </div>
                    {calcServiceType === 'frete' &&
                      calcPricing.cargoSizeComponent > 0 && (
                        <div className="flex items-center justify-between text-zinc-600">
                          <span>Adicional porte grande/volumoso</span>
                          <span className="font-mono font-medium text-zinc-900 tabular-nums">
                            {formatBRL(calcPricing.cargoSizeComponent)}
                          </span>
                        </div>
                      )}
                    {calcServiceType === 'frete' &&
                      calcPricing.helperComponent > 0 && (
                        <div className="flex items-center justify-between text-zinc-600">
                          <span>Ajudante para carga/descarga</span>
                          <span className="font-mono font-medium text-zinc-900 tabular-nums">
                            {formatBRL(calcPricing.helperComponent)}
                          </span>
                        </div>
                      )}

                    <div className="border-t border-zinc-100 pt-3 flex items-center justify-between">
                      <span className="font-semibold text-zinc-950">
                        Valor Total Estimado
                      </span>
                      <span className="font-mono text-2xl font-extrabold text-zinc-950 tabular-nums">
                        {formatBRL(calcPricing.grossTotal)}
                      </span>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-zinc-700">
                        <span>Taxa operacional inicial</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatBRL(calcPricing.standardPlatformFee)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-emerald-800 font-semibold">
                        <span>Ganho líquido do condutor</span>
                        <span className="font-mono tabular-nums">
                          {formatBRL(calcPricing.basePayout)}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                        {PROGRESSIVE_PLATFORM_FEE_NOTE} Bikes e veículos
                        elétricos têm 50% de desconto na taxa.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenRegister('pf_solicitante')}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <User className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Solicitar como Pessoa Física (CPF)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenRegister('pj_lojista')}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 whitespace-nowrap"
                    >
                      <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Solicitar como Empresa (CNPJ)</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="w-full text-center text-xs font-semibold text-zinc-600 hover:text-zinc-950 hover:underline py-1"
                    >
                      Já tem conta? Entrar e publicar pedido →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2. Seção Pública: Comércio Local no RotaJusta (tabela public.products + Carrinho Integrado) */}
        <section
          id="comercio-local"
          className="scroll-mt-20 border-b border-zinc-200 bg-zinc-50"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold text-emerald-700">
                  Vitrines Ativas em Porto Alegre · Compra Direta com Entrega
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
                  Comércio Local no RotaJusta
                </h2>
                <p className="text-sm sm:text-base text-zinc-600">
                  Adicione produtos das lojas parceiras ao carrinho abaixo,
                  informe seu CEP e feche o pedido na hora com cálculo
                  automático de entrega e pagamento via Pix.
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
                    value={storeSearchQuery}
                    onChange={(e) => setStoreSearchQuery(e.target.value)}
                    placeholder="Buscar loja, bairro ou produto..."
                    aria-label="Buscar lojas ou produtos locais"
                    className="w-full sm:w-60 rounded-lg border border-zinc-300 bg-white pl-8 pr-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                {storefronts.length > 1 && (
                  <select
                    aria-label="Filtrar por loja parceira"
                    value={selectedStoreFilter}
                    onChange={(e) => setSelectedStoreFilter(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="Todos">
                      Todas as lojas ({storefronts.length})
                    </option>
                    {storefronts.map((s) => (
                      <option key={s.merchantId} value={s.merchantId}>
                        {s.storeName} ({s.neighborhood})
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1 rounded-lg bg-zinc-200/70 p-1 overflow-x-auto">
                  {(
                    [
                      'Todos',
                      'Bike',
                      'Moto',
                      'Carro Pequeno (Passeio)',
                      'Utilitário / Picape / Van',
                    ] as const
                  ).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setStoreVehicleFilter(v)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        storeVehicleFilter === v
                          ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {v === 'Todos' ? 'Todos' : formatShortVehicleLabel(v)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isLoadingStorefronts ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-12 flex flex-col items-center justify-center gap-3 text-sm text-zinc-600">
                <Loader2
                  className="h-6 w-6 animate-spin text-emerald-600"
                  aria-hidden="true"
                />
                <span>Carregando lojas e produtos locais...</span>
              </div>
            ) : storefrontLoadError ? (
              <div className="rounded-2xl border border-amber-200 bg-white p-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle
                    className="h-4 w-4 text-amber-700 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{storefrontLoadError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadPublicLandingShowcase()}
                  className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 whitespace-nowrap shrink-0"
                >
                  Atualizar lojas
                </button>
              </div>
            ) : flattenedCatalogItems.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center space-y-4">
                <Store
                  className="mx-auto h-9 w-9 text-zinc-300"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="font-display text-lg font-bold text-zinc-900">
                    {storefronts.length === 0
                      ? 'As lojas parceiras estão publicando seus primeiros catálogos'
                      : 'Nenhum produto ou loja encontrado para essa busca'}
                  </p>
                  <p className="text-xs sm:text-sm text-zinc-600 max-w-lg mx-auto">
                    {storefronts.length === 0
                      ? 'Tem um comércio em Porto Alegre? Cadastre sua loja gratuitamente para publicar seus produtos aqui com entrega integrada via RotaJusta.'
                      : 'Limpe o filtro de busca, loja ou modal de veículo para ver todos os itens ativos.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {storefronts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStoreSearchQuery('');
                        setSelectedStoreFilter('Todos');
                        setStoreVehicleFilter('Todos');
                      }}
                      className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
                    >
                      Mostrar todas as lojas ({storefronts.length})
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenRegister('pj_lojista')}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <Store className="h-4 w-4" aria-hidden="true" />
                      <span>Cadastrar Minha Loja / Vitrine</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
                {/* Coluna Esquerda: Produtos ativos da tabela products com nome da loja parceira */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    {flattenedCatalogItems.map(({ store, product }) => {
                      const imgBroken = Boolean(
                        failedProductImgIds[product.id]
                      );
                      const inCart =
                        homeCartMerchantId === store.merchantId
                          ? homeCart[product.id]
                          : undefined;
                      const safeImg = isSafeImageUrl(product.imageUrl);

                      return (
                        <article
                          key={`${store.merchantId}-${product.id}`}
                          className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
                        >
                          <div>
                            <div className="aspect-[4/3] w-full bg-zinc-100 overflow-hidden">
                              {safeImg && !imgBroken ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setFailedProductImgIds((prev) => ({
                                      ...prev,
                                      [product.id]: true,
                                    }))
                                  }
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-100 text-zinc-400 px-3 text-center">
                                  <Package
                                    className="h-7 w-7"
                                    aria-hidden="true"
                                  />
                                  <span className="text-xs font-medium line-clamp-2">
                                    {product.name}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="p-4 space-y-2">
                              {/* Nome da Loja Parceira + Link Vitrine */}
                              <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-600">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenStorefront(store.merchantId)
                                  }
                                  className="inline-flex items-center gap-1 font-semibold text-emerald-800 hover:underline truncate text-left"
                                  title={`Abrir vitrine completa de ${store.storeName}`}
                                >
                                  <Store
                                    className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">
                                    {store.storeName}
                                  </span>
                                </button>
                                <span className="text-zinc-400 shrink-0">
                                  {store.neighborhood}
                                </span>
                              </div>

                              <h3 className="font-display text-base font-bold text-zinc-950 leading-snug line-clamp-1">
                                {product.name}
                              </h3>

                              {product.description && (
                                <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
                                  {product.description}
                                </p>
                              )}

                              <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-zinc-500">
                                <span>
                                  Entrega:{' '}
                                  {formatShortVehicleLabel(
                                    product.recommendedVehicle
                                  )}
                                </span>
                                {store.ratingCount ? (
                                  <RatingBadge
                                    avg={store.ratingAvg}
                                    count={store.ratingCount}
                                    compact
                                  />
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3">
                            <span className="font-mono text-base font-bold text-zinc-950 tabular-nums">
                              {formatBRL(product.price)}
                            </span>

                            {inCart ? (
                              <div className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 p-1">
                                <button
                                  type="button"
                                  aria-label={`Diminuir quantidade de ${product.name}`}
                                  onClick={() =>
                                    handleUpdateHomeCartQuantity(product.id, -1)
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-zinc-800 hover:bg-zinc-100"
                                >
                                  <Minus
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                </button>
                                <span className="w-6 text-center font-mono text-xs font-bold text-emerald-900 tabular-nums">
                                  {inCart.quantity}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Aumentar quantidade de ${product.name}`}
                                  onClick={() =>
                                    handleUpdateHomeCartQuantity(product.id, 1)
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                  <Plus
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddHomeProductToCart(store, product)
                                }
                                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                              >
                                <Plus
                                  className="h-3.5 w-3.5 shrink-0"
                                  aria-hidden="true"
                                />
                                <span>Adicionar</span>
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                {/* Coluna Direita: Carrinho Integrado + Cálculo Automático de Entrega + Fechar Pedido Pix */}
                <aside
                  id="home-vitrine-checkout"
                  className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 lg:sticky lg:top-20 scroll-mt-24 shadow-xs"
                >
                  {createdHomeOrder ? (
                    (() => {
                      const summary = createdHomeOrder.storefrontOrder;
                      const isPlatformPix =
                        createdHomeOrder.paymentMethod === 'pix_plataforma';
                      const pixKeyToUse = isPlatformPix
                        ? platformPixKey
                        : createdHomeOrderStore?.storePixKey || platformPixKey;
                      const pixRecipient =
                        isPlatformPix || !createdHomeOrderStore?.storePixKey
                          ? 'RotaJusta Porto Alegre'
                          : createdHomeOrder.merchantName;
                      const isScheduledOrder =
                        createdHomeOrder.pickupSchedule?.mode === 'agendada';

                      return (
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3">
                            <div>
                              <p className="text-xs font-semibold text-emerald-700">
                                Pedido criado com entrega integrada
                              </p>
                              <h3 className="font-display text-lg font-bold text-zinc-950">
                                {createdHomeOrder.merchantName}
                              </h3>
                              <p className="text-xs text-zinc-600">
                                Entrega para{' '}
                                {createdHomeOrder.stops[0]?.address} (
                                {createdHomeOrder.stops[0]?.neighborhood})
                              </p>
                              {isScheduledOrder && (
                                <p className="mt-1 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                  <CalendarClock
                                    className="h-3 w-3 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    Entrega agendada / Combinar com a loja
                                  </span>
                                </p>
                              )}
                            </div>
                            <span className="rounded-lg bg-zinc-950 px-2.5 py-1 font-mono text-xs font-black text-white shrink-0">
                              {createdHomeOrder.code}
                            </span>
                          </div>

                          {summary && (
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2 text-xs">
                              <ul className="divide-y divide-zinc-200/70">
                                {summary.items.map((item) => (
                                  <li
                                    key={item.productId}
                                    className="flex items-center justify-between py-1"
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
                                  <span>Subtotal produtos</span>
                                  <span className="font-mono tabular-nums">
                                    {formatBRL(summary.productsSubtotal)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-zinc-600">
                                  <span>
                                    Frete ({createdHomeOrder.distanceKm ?? 3} km
                                    ·{' '}
                                    {formatShortVehicleLabel(
                                      createdHomeOrder.requestedVehicle ||
                                        'Moto'
                                    )}
                                    )
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {formatBRL(summary.freightTotal)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm font-bold text-zinc-950 pt-1">
                                  <span>Total</span>
                                  <span className="font-mono text-emerald-700 tabular-nums">
                                    {formatBRL(summary.grandTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          <PixQrCodeSettlement
                            orderCode={createdHomeOrder.code}
                            amount={
                              summary?.grandTotal ?? createdHomeOrder.grossTotal
                            }
                            recipientName={pixRecipient}
                            pixKey={pixKeyToUse}
                            paymentStatus={createdHomeOrder.paymentStatus}
                            viewerRole="merchant"
                            isConfirming={isConfirmingHomePix}
                            onConfirmAction={handleConfirmHomePixSent}
                            confirmButtonLabel="Confirmar Pagamento Pix Enviado"
                          />

                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenTracking(createdHomeOrder.code)
                              }
                              className="min-h-[42px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              <MapPin className="h-4 w-4" aria-hidden="true" />
                              <span>
                                Acompanhar Entrega ({createdHomeOrder.code})
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCreatedHomeOrder(null);
                                setCreatedHomeOrderStore(null);
                              }}
                              className="min-h-[38px] w-full rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              Fazer Novo Pedido Local
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <>
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                        <div className="flex items-center gap-2">
                          <ShoppingBag
                            className="h-4 w-4 text-emerald-600"
                            aria-hidden="true"
                          />
                          <h3 className="font-display text-base font-bold text-zinc-950">
                            Carrinho &amp; Entrega RotaJusta
                          </h3>
                        </div>
                        <span className="font-mono text-xs font-semibold text-zinc-500 tabular-nums">
                          {homeCartCount} item(ns)
                        </span>
                      </div>

                      {pendingStoreSwitch && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs text-amber-950">
                          <p className="font-semibold">
                            Seu carrinho atual é de{' '}
                            <strong>{activeCartStore?.storeName}</strong>.
                            Deseja limpar e iniciar pedido em{' '}
                            <strong>
                              {pendingStoreSwitch.store.storeName}
                            </strong>
                            ?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleConfirmStoreSwitch}
                              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                            >
                              Sim, trocar para {pendingStoreSwitch.store.storeName}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingStoreSwitch(null)}
                              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              Manter atual
                            </button>
                          </div>
                        </div>
                      )}

                      {homeCartItems.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center space-y-1.5">
                          <p className="text-xs font-semibold text-zinc-800">
                            Seu carrinho local está vazio
                          </p>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            Clique em <strong>+ Adicionar</strong> em qualquer
                            produto ao lado para calcular o frete pelo seu CEP e
                            fechar o pedido com entrega RotaJusta.
                          </p>
                        </div>
                      ) : (
                        <>
                          {activeCartStore && (
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs">
                              <span className="font-semibold text-emerald-950 truncate">
                                Loja: {activeCartStore.storeName} (
                                {activeCartStore.neighborhood})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenStorefront(activeCartStore.merchantId)
                                }
                                className="text-[11px] font-semibold text-emerald-800 hover:underline whitespace-nowrap shrink-0"
                              >
                                Abrir vitrine →
                              </button>
                            </div>
                          )}

                          <ul className="divide-y divide-zinc-100 text-xs">
                            {homeCartItems.map(({ product, quantity }) => (
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
                                        handleUpdateHomeCartQuantity(
                                          product.id,
                                          -1
                                        )
                                      }
                                      className="flex h-6 w-6 items-center justify-center rounded text-zinc-700 hover:bg-white"
                                    >
                                      <Minus
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                      />
                                    </button>
                                    <span className="w-5 text-center font-mono text-xs font-bold tabular-nums">
                                      {quantity}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={`Adicionar 1 ${product.name}`}
                                      onClick={() =>
                                        handleUpdateHomeCartQuantity(
                                          product.id,
                                          1
                                        )
                                      }
                                      className="flex h-6 w-6 items-center justify-center rounded text-zinc-700 hover:bg-white"
                                    >
                                      <Plus
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </div>

                                  <span className="w-16 text-right font-mono font-bold text-zinc-900 tabular-nums">
                                    {formatBRL(product.price * quantity)}
                                  </span>

                                  <button
                                    type="button"
                                    aria-label={`Excluir ${product.name} do carrinho`}
                                    onClick={() =>
                                      handleUpdateHomeCartQuantity(
                                        product.id,
                                        -quantity
                                      )
                                    }
                                    className="p-1 text-zinc-400 hover:text-red-600"
                                  >
                                    <Trash2
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      <form
                        onSubmit={(e) => void handleHomeCartCheckoutSubmit(e)}
                        className="space-y-3.5 border-t border-zinc-100 pt-4"
                      >
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="home-checkout-name"
                              className="block text-[11px] font-semibold text-zinc-700 mb-1"
                            >
                              Seu Nome Completo
                            </label>
                            <input
                              id="home-checkout-name"
                              type="text"
                              value={cartCustomerName}
                              onChange={(e) =>
                                setCartCustomerName(e.target.value)
                              }
                              placeholder="Ex: Juliana Martins"
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="home-checkout-phone"
                              className="block text-[11px] font-semibold text-zinc-700 mb-1"
                            >
                              WhatsApp para Avisos
                            </label>
                            <input
                              id="home-checkout-phone"
                              type="tel"
                              value={cartCustomerPhone}
                              onChange={(e) =>
                                setCartCustomerPhone(e.target.value)
                              }
                              placeholder="(51) 99999-0000"
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
                          <AddressAutocompleteFields
                            idPrefix="home-cart-dest"
                            sectionLabel="CEP / Endereço de Entrega (busca automática)"
                            value={cartDestAddr}
                            onChange={(next) => setCartDestAddr(next)}
                            compact
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="home-checkout-note"
                            className="block text-[11px] font-semibold text-zinc-700 mb-1"
                          >
                            Observação (opcional)
                          </label>
                          <input
                            id="home-checkout-note"
                            type="text"
                            value={cartDeliveryNote}
                            onChange={(e) =>
                              setCartDeliveryNote(e.target.value)
                            }
                            placeholder="Ex: Interfone 302, chamar na portaria"
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCartPaymentMethod('pix_direto')}
                            className={`rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                              cartPaymentMethod === 'pix_direto'
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            Pix Direto à Loja
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCartPaymentMethod('pix_plataforma')
                            }
                            className={`rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                              cartPaymentMethod === 'pix_plataforma'
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            Pix Plataforma
                          </button>
                        </div>

                        {/* Disponibilidade em tempo real por categoria + auto-upgrade */}
                        {homeCartItems.length > 0 && (
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-zinc-800">
                                Modal de Entrega
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-emerald-700 tabular-nums">
                                {isLoadingAvailability
                                  ? 'Verificando...'
                                  : `${cartVehicleAvailability.totalOnlineAll} online em POA`}
                              </span>
                            </div>

                            {!isLoadingAvailability &&
                              cartVehicleAvailability.wasPreferredUnavailable &&
                              cartVehicleAvailability.hasAnyAvailableInAllowed && (
                                <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
                                  Sem entregadores de{' '}
                                  <strong>
                                    {formatShortVehicleLabel(
                                      cartRecommendedVehicle
                                    )}
                                  </strong>{' '}
                                  online agora. Ajustado automaticamente para{' '}
                                  <strong>
                                    {formatShortVehicleLabel(
                                      cartEffectiveVehicle
                                    )}
                                  </strong>
                                  .
                                </p>
                              )}

                            <div className="grid grid-cols-2 gap-1.5">
                              {VEHICLE_CATEGORIES.map((category) => {
                                const onlineCount =
                                  onlineCountsByVehicle[category] || 0;
                                const isLighterThanRecommended =
                                  VEHICLE_CATEGORIES.indexOf(category) <
                                  VEHICLE_CATEGORIES.indexOf(
                                    cartRecommendedVehicle
                                  );
                                const isUnavailableOnline =
                                  !isLoadingAvailability && onlineCount === 0;
                                const isDisabled =
                                  isLighterThanRecommended ||
                                  (isCartAnyOnlineAvailable &&
                                    isUnavailableOnline);
                                const isSelected =
                                  cartEffectiveVehicle === category;
                                const previewFreight = calculatePricing(
                                  'rapida',
                                  cartDistanceKm,
                                  1,
                                  undefined,
                                  category
                                );

                                return (
                                  <button
                                    key={category}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() =>
                                      setCartManualVehicle(category)
                                    }
                                    className={`rounded-lg border p-2 text-left transition-colors ${
                                      isSelected
                                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                                        : isDisabled
                                        ? 'border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed opacity-75'
                                        : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1 text-[11px]">
                                      <span className="font-bold truncate">
                                        {formatShortVehicleLabel(category)}
                                      </span>
                                      <span className="font-mono font-semibold tabular-nums shrink-0">
                                        {formatBRL(previewFreight.grossTotal)}
                                      </span>
                                    </div>
                                    <p
                                      className={`mt-0.5 text-[10px] font-medium ${
                                        isLighterThanRecommended
                                          ? 'text-zinc-400'
                                          : isUnavailableOnline
                                          ? 'text-amber-700'
                                          : 'text-emerald-700'
                                      }`}
                                    >
                                      {isLighterThanRecommended
                                        ? 'Exige maior'
                                        : isUnavailableOnline
                                        ? 'Sem entregadores online agora'
                                        : `${onlineCount} online`}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>

                            {cartMustOfferScheduledFallback && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCartDeliveryArrangement('agendada_loja')
                                }
                                className="w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-left text-[11px] font-bold text-amber-950"
                              >
                                ✓ Entrega agendada / Combinar com a loja (sem
                                entregadores online agora)
                              </button>
                            )}
                          </div>
                        )}

                        {/* Resumo em Tempo Real: Produtos + Frete */}
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-zinc-700">
                            <span>Subtotal dos produtos</span>
                            <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                              {formatBRL(homeCartProductsSubtotal)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-zinc-700">
                            <span>
                              Frete automático (
                              {cartHasDestFilled
                                ? `${cartDistanceKm} km`
                                : 'est. 3 km'}{' '}
                              · {formatShortVehicleLabel(cartEffectiveVehicle)})
                            </span>
                            <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                              {homeCartItems.length > 0
                                ? formatBRL(cartFreightPricing.grossTotal)
                                : formatBRL(0)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-t border-emerald-200 pt-2">
                            <span className="font-display text-sm font-bold text-zinc-950">
                              Total do Pedido
                            </span>
                            <span className="font-mono text-lg font-extrabold text-emerald-700 tabular-nums">
                              {homeCartItems.length > 0
                                ? formatBRL(cartGrandTotal)
                                : formatBRL(0)}
                            </span>
                          </div>
                        </div>

                        {cartCheckoutError && (
                          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                            {cartCheckoutError}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={
                            isSubmittingCartOrder || homeCartItems.length === 0
                          }
                          className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs sm:text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2
                            className="h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>
                            {isSubmittingCartOrder
                              ? 'Gerando pedido #RS-XXXX...'
                              : homeCartItems.length > 0
                              ? `Fechar Pedido com Entrega (${formatBRL(
                                  cartGrandTotal
                                )})`
                              : 'Adicione produtos para fechar o pedido'}
                          </span>
                        </button>
                      </form>
                    </>
                  )}
                </aside>
              </div>
            )}
          </div>
        </section>

        {/* 3. Nossa História e Propósito */}
        <section
          id="nossa-historia"
          className="scroll-mt-24 bg-zinc-950 text-white border-b border-zinc-800"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 space-y-12">
            {/* Editorial Section Header */}
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Nossa História · Porto Alegre (RS)
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
                Mais de 30 anos de estrada, balcão e logística em Porto Alegre
              </h2>
              <p className="text-base sm:text-lg italic text-zinc-300 leading-relaxed">
                &ldquo;O RotaJusta não nasceu em uma sala fechada — nasceu da
                vivência real de quem já esteve dos dois lados da
                entrega.&rdquo;
              </p>
            </div>

            {/* Clean 4-Milestone Editorial Timeline */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="hidden lg:block absolute left-0 right-0 top-6 h-px bg-zinc-800"
              />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Marco 1: 1994 */}
                <article className="relative flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-emerald-400">
                        <Truck className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                        1994
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-white leading-snug">
                      Disciplina e Responsabilidade na Estrada
                    </h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      A trajetória começou no volante de caminhões no Exército
                      Brasileiro em Porto Alegre, onde se aprende na prática o
                      valor do horário cumprido, do cuidado com a carga e do
                      respeito a cada pessoa envolvida na operação.
                    </p>
                  </div>
                </article>

                {/* Marco 2: 1997 */}
                <article className="relative flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-emerald-400">
                        <Bike className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                        1997
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-white leading-snug">
                      O Início da Tele-Entrega
                    </h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      Ainda nos primeiros anos da tele-entrega de moto na
                      capital gaúcha — sem GPS e sem aplicativos — veio a
                      vivência real das ruas, da chuva, do trânsito e da
                      importância de um repasse justo para quem sustenta a
                      família sobre duas ou quatro rodas.
                    </p>
                  </div>
                </article>

                {/* Marco 3: Do Outro Lado do Balcão */}
                <article className="relative flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-emerald-400">
                        <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-semibold text-zinc-400">
                        Balcão &amp; Gestão
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-white leading-snug">
                      Do Outro Lado do Balcão (Setor Gráfico &amp; Transporte
                      Urbano)
                    </h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      A experiência também passou por dentro das empresas — no
                      setor gráfico, sentindo a urgência de despachar pedidos com
                      prazo apertado e depender de entregas confiáveis — além do
                      transporte de passageiros em linhas urbanas e da formação
                      técnica em aviação, onde planejamento, checklist e
                      segurança vêm sempre em primeiro lugar.
                    </p>
                  </div>
                </article>

                {/* Marco 4: Hoje */}
                <article className="relative flex flex-col justify-between rounded-2xl border border-emerald-500/40 bg-emerald-950/35 p-6 space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                        <HeartHandshake className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-semibold text-emerald-300">
                        Hoje · POA
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-white leading-snug">
                      O Propósito do RotaJusta Hoje
                    </h3>
                    <p className="text-sm text-zinc-200 leading-relaxed">
                      Unindo a visão de quem precisa enviar com agilidade e a
                      realidade de quem está na rua entregando, o RotaJusta foi
                      criado com uma regra simples:{' '}
                      <strong className="font-semibold text-white">
                        respeitar o tempo e o ganha-pão de quem trabalha
                      </strong>
                      , conectando comércios, moradores e entregadores de Porto
                      Alegre sem taxas abusivas, com pagamento direto via Pix e
                      incentivo real à mobilidade elétrica.
                    </p>
                  </div>
                </article>
              </div>
            </div>

            {/* Commitments Strip */}
            <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3 border-t border-zinc-800">
              <div className="space-y-1">
                <p className="font-display text-lg font-bold text-emerald-400 tabular-nums">
                  100% claro
                </p>
                <p className="text-xs text-zinc-400">
                  Valor do condutor e taxa da plataforma visíveis antes de
                  fechar o pedido.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-display text-lg font-bold text-emerald-400 tabular-nums">
                  Pix na hora
                </p>
                <p className="text-xs text-zinc-400">
                  Sem reter o ganho da semana: transferência direta após a
                  aceitação.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-display text-lg font-bold text-emerald-400 tabular-nums">
                  -50% na Taxa Bike &amp; EV
                </p>
                <p className="text-xs text-zinc-400">
                  50% de desconto na taxa operacional para bikes e veículos
                  elétricos (EVs) em Porto Alegre.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Cards de Benefícios por Perfil */}
        <section className="bg-zinc-50">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Para cada necessidade na cidade
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
                Um sistema pensado para cada perfil em Porto Alegre
              </h2>
              <p className="text-sm sm:text-base text-zinc-600">
                Escolha como deseja começar. O cadastro leva menos de dois
                minutos com validação real de CPF ou CNPJ.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Card 1: Comércio & Lojistas (CNPJ) */}
              <article className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="space-y-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-950 text-white">
                    <Store className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-zinc-950">
                      Comércio &amp; Lojistas (CNPJ)
                    </h3>
                    <p className="mt-1 text-xs font-medium text-zinc-500">
                      Ideal para lojas, cafés, farmácias, floriculturas e
                      e-commerce local.
                    </p>
                  </div>

                  <ul className="space-y-2.5 text-sm text-zinc-700">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Vitrine pública integrada e painel prático para entregas
                        rápidas, rotas consolidadas ou pequenos fretes.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Cálculo automático por CEP e distância em Porto Alegre,
                        com mapa da rota antes de publicar.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Rastreamento em tempo real e comprovação de entrega com
                        foto e nome de quem recebeu.
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => onOpenRegister('pj_lojista')}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
                  >
                    <span>Cadastrar Empresa (CNPJ)</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>

              {/* Card 2: Uso Pessoal (CPF) */}
              <article className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="space-y-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
                    <User className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-zinc-950">
                      Uso Pessoal (CPF)
                    </h3>
                    <p className="mt-1 text-xs font-medium text-zinc-500">
                      Para qualquer morador contratar um pequeno frete ou enviar
                      pacotes.
                    </p>
                  </div>

                  <ul className="space-y-2.5 text-sm text-zinc-700">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Precisa levar geladeira, sofá, eletrodomésticos,
                        caixas ou enviar uma chave/documento pela cidade?
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Cadastro como Pessoa Física liberado na hora com CPF
                        válido, sem precisar abrir empresa.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Pagamento rápido por Pix direto ao motorista ou pela
                        plataforma, com foto de entrega garantida.
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => onOpenRegister('pf_solicitante')}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
                  >
                    <span>Cadastrar Pessoa Física (CPF)</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>

              {/* Card 3: Entregadores & Mobilidade Elétrica */}
              <article className="flex flex-col justify-between rounded-2xl border border-emerald-700/30 bg-zinc-950 p-6 text-white shadow-sm">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                      <Zap className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-300">
                      -50% Taxa EV &amp; Bike
                    </span>
                  </div>

                  <div>
                    <h3 className="font-display text-lg font-bold text-white">
                      Entregadores &amp; Mobilidade Elétrica
                    </h3>
                    <p className="mt-1 text-xs font-medium text-zinc-400">
                      Bike, Moto, Carro Pequeno ou Utilitário rodando em Porto
                      Alegre.
                    </p>
                  </div>

                  <ul className="space-y-2.5 text-sm text-zinc-200">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Pagamento direto via Pix com chave cadastrada no seu
                        perfil e painel financeiro claro.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Sistema justo de avaliação por estrelas e ofertas
                        compatíveis com seu veículo e raio da Bike.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        <strong className="text-emerald-300">
                          Incentivo para bikes e veículos elétricos (EVs):
                        </strong>{' '}
                        50% de desconto na taxa operacional para bikes e veículos
                        elétricos em relação à categoria a combustão.
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => onOpenRegister('pf_entregador')}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                  >
                    <span>Quero Fazer Entregas</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Discreet empty database helper for initial setup */}
        {!isCheckingEmpty && isDatabaseEmpty && !dbError && (
          <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3.5 text-xs text-emerald-950 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck
                  className="h-4 w-4 text-emerald-700 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Base Supabase vazia. Você pode carregar perfis iniciais (Admin
                  + Moto Elétrica + Utilitário) e 2 pedidos de exemplo em POA.
                </span>
              </div>
              <button
                type="button"
                disabled={isSeeding}
                onClick={() => void onSeedTestData()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {isSeeding
                    ? 'Carregando...'
                    : 'Carregar Dados Iniciais de Teste'}
                </span>
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-zinc-900">
              RotaJusta
            </span>
            <span>·</span>
            <span>Entregas urbanas e mobilidade justa em Porto Alegre (RS)</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setLegalModalTab('termos')}
              className="font-semibold text-zinc-600 hover:text-emerald-700"
            >
              Termos de Uso
            </button>
            <button
              type="button"
              onClick={() => setLegalModalTab('privacidade')}
              className="font-semibold text-zinc-600 hover:text-emerald-700"
            >
              Política de Privacidade
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('nossa-historia')}
              className="font-semibold text-zinc-600 hover:text-emerald-700"
            >
              Nossa História
            </button>
            <button
              type="button"
              onClick={onOpenLogin}
              className="font-semibold text-zinc-700 hover:text-emerald-700"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => onOpenRegister('pf_solicitante')}
              className="font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Cadastrar-se
            </button>
          </div>
        </div>
      </footer>

      {legalModalTab && (
        <LegalModal
          initialTab={legalModalTab}
          onClose={() => setLegalModalTab(null)}
        />
      )}
    </div>
  );
}
