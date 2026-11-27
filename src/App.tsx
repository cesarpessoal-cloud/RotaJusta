import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { AuthScreen, AuthTab, RegProfileChoice } from './components/AuthScreen';
import { CourierBoard } from './components/CourierBoard';
import { AdminSupervisionView, Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { LegalDocTab, LegalModal } from './components/LegalModal';
import { MerchantPanel } from './components/MerchantPanel';
import { MyAccountModal } from './components/MyAccountModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import {
  acceptDeliveryInSupabase,
  adminDeleteProfileInSupabase,
  AdminProfileUpdateInput,
  adminUpdateProfileInSupabase,
  checkIfDatabaseIsEmpty,
  completeDeliveryInSupabase,
  confirmDeliveryStopInSupabase,
  createDeliveryInSupabase,
  fetchAllDeliveries,
  fetchAllProfiles,
  fetchAllRatingsInSupabase,
  fetchApprovedCouriers,
  fetchDeliveryByIdWithStops,
  fetchOnlineCouriersCountInSupabase,
  fetchPlatformPixKey,
  fetchProfilesPhonesByIds,
  fetchPublicProfilesDirectory,
  fetchWaitingDeliveries,
  mapDbStatusToApproval,
  seedInitialSupabaseData,
  submitRatingInSupabase,
  updateBikeMaxRadiusInSupabase,
  updateCourierOnlineStatusInSupabase,
  updateDeliveryPaymentStatusInSupabase,
  updateDeliveryQuickNoticeInSupabase,
  updatePixKeyInSupabase,
  updateProfileStatusInSupabase,
} from './lib/supabaseService';
import {
  ApprovalStatus,
  CourierQuickNoticeType,
  Order,
  Profile,
  Rating,
} from './types';
import { formatBRL, getCourierSettlementForOrder } from './utils/pricing';
import { getQuickNoticeMessage } from './utils/quickNotice';
import {
  playRotaJustaAlert,
  requestBrowserNotificationPermission,
  showBrowserDeliveryNotification,
  unlockAudioEngine,
} from './utils/soundAlert';
import { isOrderCompatibleWithVehicle } from './utils/vehicleCompatibility';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [unauthView, setUnauthView] = useState<'landing' | 'auth'>('landing');
  const [authInitialTab, setAuthInitialTab] = useState<AuthTab>('entrar');
  const [authInitialRegChoice, setAuthInitialRegChoice] =
    useState<RegProfileChoice>('pf_solicitante');
  const [landingOnlineCouriersCount, setLandingOnlineCouriersCount] =
    useState<number>(0);
  const [isLoadingOnlineCount, setIsLoadingOnlineCount] =
    useState<boolean>(true);
  const [adminView, setAdminView] = useState<AdminSupervisionView>('admin');

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [approvedCouriers, setApprovedCouriers] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [waitingOrders, setWaitingOrders] = useState<Order[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [platformPixKey, setPlatformPixKey] = useState<string | null>(null);
  const [activeCourierId, setActiveCourierId] = useState<string>('');
  const [activeMerchantId, setActiveMerchantId] = useState<string>('');

  const [isDatabaseEmpty, setIsDatabaseEmpty] = useState<boolean>(false);
  const [isCheckingEmpty, setIsCheckingEmpty] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalDocTab | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newOfferBanner, setNewOfferBanner] = useState<Order | null>(null);

  const merchantFormRef = useRef<HTMLFormElement | null>(null);
  const currentUserRef = useRef<Profile | null>(null);
  const profilesRef = useRef<Profile[]>([]);
  const approvedCouriersRef = useRef<Profile[]>([]);
  const activeCourierIdRef = useRef<string>('');
  const adminViewRef = useRef<AdminSupervisionView>('admin');
  const seenRealtimeOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    approvedCouriersRef.current = approvedCouriers;
  }, [approvedCouriers]);

  useEffect(() => {
    activeCourierIdRef.current = activeCourierId;
  }, [activeCourierId]);

  useEffect(() => {
    adminViewRef.current = adminView;
  }, [adminView]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!newOfferBanner) return;
    const timer = window.setTimeout(() => setNewOfferBanner(null), 16000);
    return () => window.clearTimeout(timer);
  }, [newOfferBanner]);

  const activeSupervisedOrLoggedCourier = useMemo(() => {
    if (!currentUser) return undefined;
    if (
      (currentUser.role === 'entregador' || currentUser.role === 'motorista') &&
      currentUser.approvalStatus === 'Aprovado'
    ) {
      return currentUser;
    }
    if (currentUser.role === 'admin' && adminView === 'entregador') {
      return (
        approvedCouriers.find((c) => c.id === activeCourierId) ??
        approvedCouriers[0]
      );
    }
    return undefined;
  }, [currentUser, adminView, approvedCouriers, activeCourierId]);

  useEffect(() => {
    if (!activeSupervisedOrLoggedCourier?.isOnline) {
      setNewOfferBanner(null);
    }
  }, [activeSupervisedOrLoggedCourier?.id, activeSupervisedOrLoggedCourier?.isOnline]);

  const checkEmptyState = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDbError(
        'Credenciais do Supabase não configuradas (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
      );
      setIsCheckingEmpty(false);
      return;
    }

    setIsCheckingEmpty(true);
    setDbError(null);
    try {
      const empty = await checkIfDatabaseIsEmpty();
      setIsDatabaseEmpty(empty);
    } catch (err) {
      setDbError(
        err instanceof Error
          ? err.message
          : 'Erro ao conectar com o Supabase.'
      );
    } finally {
      setIsCheckingEmpty(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      void checkEmptyState();
    }
  }, [currentUser, checkEmptyState]);

  const loadLandingOnlineCouriersCount = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoadingOnlineCount(false);
      return;
    }
    try {
      const count = await fetchOnlineCouriersCountInSupabase();
      setLandingOnlineCouriersCount(count);
    } catch {
      // Silencioso na landing pública
    } finally {
      setIsLoadingOnlineCount(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser || !isSupabaseConfigured) return;

    setIsLoadingOnlineCount(true);
    void loadLandingOnlineCouriersCount();

    const channel = supabase
      .channel('rotajusta-landing-online-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void loadLandingOnlineCouriersCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser, loadLandingOnlineCouriersCount]);

  // Supabase Realtime: monitora novas entregas ('aguardando'), atualizações de pedidos e status is_online
  useEffect(() => {
    if (!currentUser?.id || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`rotajusta-realtime-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deliveries' },
        (payload) => {
          const row = payload.new as { id?: string; status?: string } | null;
          if (!row?.id) return;
          const deliveryId = row.id;
          const isWaiting =
            (row.status || '').toLowerCase() === 'aguardando';

          // Aguarda brevemente as paradas (delivery_stops) serem gravadas logo após deliveries
          window.setTimeout(async () => {
            try {
              const knownProfiles =
                profilesRef.current.length > 0
                  ? profilesRef.current
                  : approvedCouriersRef.current;
              const freshOrder = await fetchDeliveryByIdWithStops(
                deliveryId,
                knownProfiles
              );
              if (!freshOrder) return;

              setOrders((prev) =>
                prev.some((o) => o.id === freshOrder.id)
                  ? prev.map((o) => (o.id === freshOrder.id ? freshOrder : o))
                  : [freshOrder, ...prev]
              );

              if (isWaiting && freshOrder.status === 'Aguardando') {
                setWaitingOrders((prev) =>
                  prev.some((o) => o.id === freshOrder.id)
                    ? prev.map((o) =>
                        o.id === freshOrder.id ? freshOrder : o
                      )
                    : [freshOrder, ...prev]
                );

                if (seenRealtimeOrderIdsRef.current.has(freshOrder.id)) {
                  return;
                }
                seenRealtimeOrderIdsRef.current.add(freshOrder.id);

                const activeUser = currentUserRef.current;
                if (!activeUser) return;

                const supervisedCourier =
                  activeUser.role === 'admin' &&
                  adminViewRef.current === 'entregador'
                    ? approvedCouriersRef.current.find(
                        (c) => c.id === activeCourierIdRef.current
                      )
                    : undefined;

                const targetCourier =
                  activeUser.role === 'entregador' ||
                  activeUser.role === 'motorista'
                    ? activeUser.approvalStatus === 'Aprovado'
                      ? activeUser
                      : undefined
                    : supervisedCourier;

                if (
                  targetCourier &&
                  targetCourier.isOnline &&
                  isOrderCompatibleWithVehicle(
                    freshOrder.type,
                    targetCourier.vehicleType,
                    freshOrder.distanceKm,
                    targetCourier.bikeMaxRadiusKm,
                    freshOrder.requestedVehicle
                  )
                ) {
                  setNewOfferBanner(freshOrder);
                  void playRotaJustaAlert();
                  showBrowserDeliveryNotification(freshOrder);
                }
              }
            } catch {
              // Ignora erros transitórios de fetch em segundo plano
            }
          }, 480);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deliveries' },
        (payload) => {
          const row = payload.new as { id?: string } | null;
          if (!row?.id) return;
          const deliveryId = row.id;

          window.setTimeout(async () => {
            try {
              const knownProfiles =
                profilesRef.current.length > 0
                  ? profilesRef.current
                  : approvedCouriersRef.current;
              const rawUpdated = await fetchDeliveryByIdWithStops(
                deliveryId,
                knownProfiles
              );
              if (!rawUpdated) return;

              let updatedOrder = rawUpdated;
              if (
                updatedOrder.status === 'Em Rota' &&
                !updatedOrder.merchantPhone &&
                updatedOrder.merchantId
              ) {
                const phoneMap = await fetchProfilesPhonesByIds([
                  updatedOrder.merchantId,
                ]);
                const fetchedPhone = phoneMap.get(updatedOrder.merchantId);
                if (fetchedPhone) {
                  updatedOrder = {
                    ...updatedOrder,
                    merchantPhone: fetchedPhone,
                  };
                }
              }

              setOrders((prev) =>
                prev.some((o) => o.id === updatedOrder.id)
                  ? prev.map((o) =>
                      o.id === updatedOrder.id ? updatedOrder : o
                    )
                  : [updatedOrder, ...prev]
              );

              if (updatedOrder.status === 'Aguardando') {
                setWaitingOrders((prev) =>
                  prev.some((o) => o.id === updatedOrder.id)
                    ? prev.map((o) =>
                        o.id === updatedOrder.id ? updatedOrder : o
                      )
                    : [updatedOrder, ...prev]
                );
              } else {
                setWaitingOrders((prev) =>
                  prev.filter((o) => o.id !== updatedOrder.id)
                );
              }
            } catch {
              // Silencioso em background
            }
          }, 250);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const row = payload.new as {
            id?: string;
            is_online?: boolean | null;
            status?: string;
            max_radius_km?: number | null;
          } | null;
          if (!row?.id) return;

          const nextOnline = Boolean(row.is_online);
          const nextApproval = row.status
            ? mapDbStatusToApproval(row.status)
            : undefined;

          setProfiles((prev) =>
            prev.map((p) =>
              p.id === row.id
                ? {
                    ...p,
                    isOnline: nextOnline,
                    ...(nextApproval ? { approvalStatus: nextApproval } : {}),
                    ...(row.max_radius_km !== undefined
                      ? { bikeMaxRadiusKm: row.max_radius_km }
                      : {}),
                  }
                : p
            )
          );

          setApprovedCouriers((prev) =>
            prev.map((c) =>
              c.id === row.id
                ? {
                    ...c,
                    isOnline: nextOnline,
                    ...(nextApproval ? { approvalStatus: nextApproval } : {}),
                    ...(row.max_radius_km !== undefined
                      ? { bikeMaxRadiusKm: row.max_radius_km }
                      : {}),
                  }
                : c
            )
          );

          if (currentUserRef.current?.id === row.id) {
            setCurrentUser((prev) =>
              prev
                ? {
                    ...prev,
                    isOnline: nextOnline,
                    ...(nextApproval ? { approvalStatus: nextApproval } : {}),
                  }
                : prev
            );
          }

          if (
            !nextOnline &&
            (currentUserRef.current?.id === row.id ||
              (adminViewRef.current === 'entregador' &&
                activeCourierIdRef.current === row.id))
          ) {
            setNewOfferBanner(null);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const loadRoleWorkspaceData = useCallback(
    async (user: Profile, silent = false) => {
      if (!isSupabaseConfigured) {
        setDbError(
          'Credenciais do Supabase não configuradas (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
        );
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }
      setDbError(null);

      try {
        if (user.role === 'admin') {
          const [allProfiles, couriers, allRatings] = await Promise.all([
            fetchAllProfiles(),
            fetchApprovedCouriers(),
            fetchAllRatingsInSupabase().catch(() => [] as Rating[]),
          ]);

          const [allDeliveries, waitingDeliveries] = await Promise.all([
            fetchAllDeliveries(allProfiles),
            fetchWaitingDeliveries(allProfiles),
          ]);

          setProfiles(allProfiles);
          setApprovedCouriers(couriers);
          setOrders(allDeliveries);
          setWaitingOrders(waitingDeliveries);
          setRatings(allRatings);
          const adminProf = allProfiles.find((p) => p.id === 'admin' || p.role === 'admin');
          setPlatformPixKey(adminProf?.pixKey || user.pixKey || null);
          setIsDatabaseEmpty(
            allProfiles.length === 0 && allDeliveries.length === 0
          );

          setActiveCourierId((prev) =>
            couriers.some((c) => c.id === prev) ? prev : couriers[0]?.id || ''
          );
          const approvedMerchants = allProfiles.filter(
            (p) => p.role === 'lojista' && p.approvalStatus === 'Aprovado'
          );
          setActiveMerchantId((prev) =>
            approvedMerchants.some((m) => m.id === prev)
              ? prev
              : approvedMerchants[0]?.id || ''
          );
        } else if (user.role === 'lojista') {
          const [directory, officialPix, allRatings] = await Promise.all([
            fetchPublicProfilesDirectory(),
            fetchPlatformPixKey(),
            fetchAllRatingsInSupabase().catch(() => [] as Rating[]),
          ]);
          const couriers = directory.filter(
            (p) =>
              (p.role === 'entregador' || p.role === 'motorista') &&
              p.approvalStatus === 'Aprovado'
          );
          const enriched = await fetchAllDeliveries(directory);
          setProfiles(directory);
          setApprovedCouriers(couriers);
          setOrders(enriched);
          setRatings(allRatings);
          setPlatformPixKey(officialPix);
          setActiveMerchantId(user.id);
        } else {
          // Entregador / Motorista aprovado
          const [directory, allRatings] = await Promise.all([
            fetchPublicProfilesDirectory(),
            fetchAllRatingsInSupabase().catch(() => [] as Rating[]),
          ]);
          const mergedDirectory = [
            user,
            ...directory.filter((p) => p.id !== user.id),
          ];
          const [allDeliveries, waitingDeliveries] = await Promise.all([
            fetchAllDeliveries(mergedDirectory),
            fetchWaitingDeliveries(mergedDirectory),
          ]);
          const activeMerchantIds = allDeliveries
            .filter((o) => o.status === 'Em Rota' && o.merchantId)
            .map((o) => o.merchantId);
          const phoneMap = await fetchProfilesPhonesByIds(activeMerchantIds);
          const enrichedDeliveries =
            phoneMap.size > 0
              ? allDeliveries.map((o) =>
                  o.merchantId && phoneMap.has(o.merchantId)
                    ? { ...o, merchantPhone: phoneMap.get(o.merchantId) }
                    : o
                )
              : allDeliveries;

          setProfiles(mergedDirectory);
          setApprovedCouriers([user]);
          setOrders(enrichedDeliveries);
          setWaitingOrders(waitingDeliveries);
          setRatings(allRatings);
          setActiveCourierId(user.id);
        }
      } catch (err) {
        setDbError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar dados do Supabase.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleLoginSuccess = async (profile: Profile) => {
    setCurrentUser(profile);
    if (profile.role === 'admin') {
      setAdminView('admin');
    }
    showToast(`Bem-vindo(a), ${profile.name}!`);
    await loadRoleWorkspaceData(profile, false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUnauthView('landing');
    setAdminView('admin');
    setIsAccountModalOpen(false);
    setProfiles([]);
    setApprovedCouriers([]);
    setOrders([]);
    setWaitingOrders([]);
    setRatings([]);
    setPlatformPixKey(null);
    setDbError(null);
  };

  const handleOpenLogin = () => {
    setAuthInitialTab('entrar');
    setUnauthView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenRegister = (presetChoice: RegProfileChoice) => {
    setAuthInitialTab('cadastrar');
    setAuthInitialRegChoice(presetChoice);
    setUnauthView('auth');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAccountUpdated = (updated: Profile, message: string) => {
    setCurrentUser(updated);
    if (updated.role === 'admin') {
      setPlatformPixKey(updated.pixKey || null);
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    setApprovedCouriers((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    setOrders((prev) =>
      prev.map((o) =>
        o.assignedCourierId === updated.id
          ? {
              ...o,
              assignedCourierName: updated.name,
              assignedCourierAvatarUrl: updated.avatarUrl,
              assignedCourierVehicleType: updated.vehicleType,
              assignedCourierVehicleModel: updated.vehicleModel,
              assignedCourierVehicleColor: updated.vehicleColor,
              assignedCourierPlate: updated.plate,
              assignedCourierPropulsion: updated.propulsion,
              assignedCourierPixKey: updated.pixKey,
            }
          : o
      )
    );
    showToast(message);
  };

  const handleSelectAdminView = (view: AdminSupervisionView) => {
    setAdminView(view);
    if (currentUser && !isLoading) {
      void loadRoleWorkspaceData(currentUser, true);
    }
  };

  const merchants = useMemo(
    () =>
      profiles.filter(
        (p) => p.role === 'lojista' && p.approvalStatus === 'Aprovado'
      ),
    [profiles]
  );

  const onlineCouriers = useMemo(
    () =>
      profiles.filter(
        (p) =>
          (p.role === 'entregador' || p.role === 'motorista') &&
          p.approvalStatus === 'Aprovado' &&
          Boolean(p.isOnline)
      ),
    [profiles]
  );

  const pendingApprovalsCount = useMemo(
    () =>
      profiles.filter((p) => p.approvalStatus === 'Aguardando Aprovação').length,
    [profiles]
  );

  const pendingCouriersCount = useMemo(
    () =>
      profiles.filter(
        (p) =>
          (p.role === 'entregador' || p.role === 'motorista') &&
          p.approvalStatus === 'Aguardando Aprovação'
      ).length,
    [profiles]
  );

  const handleToggleOnlineStatus = async (
    courierId: string,
    nextOnline: boolean
  ) => {
    if (
      !currentUser ||
      (currentUser.role !== 'admin' && currentUser.id !== courierId)
    ) {
      return;
    }

    if (!nextOnline) {
      setNewOfferBanner(null);
    }

    if (nextOnline) {
      await unlockAudioEngine();
      await requestBrowserNotificationPermission();
    }

    try {
      const updated = await updateCourierOnlineStatusInSupabase(
        courierId,
        nextOnline
      );
      setProfiles((prev) =>
        prev.map((p) => (p.id === courierId ? updated : p))
      );
      setApprovedCouriers((prev) =>
        prev.map((c) => (c.id === courierId ? updated : c))
      );
      if (currentUser.id === courierId) {
        setCurrentUser(updated);
      }
      showToast(
        nextOnline
          ? '🟢 Você está ONLINE! Mural de ofertas liberado e alertas ativados.'
          : '🔴 Você está OFFLINE. Mural oculto e alertas de novas entregas bloqueados.'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar status Online/Offline no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleTestSoundAlert = async () => {
    if (!activeSupervisedOrLoggedCourier?.isOnline) {
      showToast(
        'Alertas bloqueados enquanto você está OFFLINE. Mude manualmente para ONLINE primeiro.'
      );
      return;
    }
    await unlockAudioEngine();
    await requestBrowserNotificationPermission();
    await playRotaJustaAlert();
    showToast(
      'Áudio desbloqueado! Alerta "RotaJusta!" reproduzido com sucesso.'
    );
  };

  const handleCreateOrder = async (
    newOrder: Order
  ): Promise<{ order: Order | null; errorMessage?: string }> => {
    try {
      const savedOrder = await createDeliveryInSupabase(newOrder);
      const authorProfile = profiles.find((p) => p.id === savedOrder.merchantId) || currentUser;
      const enrichedOrder: Order = {
        ...savedOrder,
        merchantRatingAvg:
          savedOrder.merchantRatingAvg ?? authorProfile?.ratingAvg ?? 0,
        merchantRatingCount:
          savedOrder.merchantRatingCount ?? authorProfile?.ratingCount ?? 0,
      };
      seenRealtimeOrderIdsRef.current.add(enrichedOrder.id);
      setOrders((prev) =>
        prev.some((o) => o.id === enrichedOrder.id)
          ? prev
          : [enrichedOrder, ...prev]
      );
      setWaitingOrders((prev) =>
        prev.some((o) => o.id === enrichedOrder.id)
          ? prev
          : [enrichedOrder, ...prev]
      );
      showToast(
        `Pedido ${enrichedOrder.code} gravado no Supabase para ${enrichedOrder.destinationNeighborhood}.`
      );
      return { order: enrichedOrder };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao publicar pedido no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
      return { order: null, errorMessage: msg };
    }
  };

  const handleAcceptOrder = async (orderId: string, courier: Profile) => {
    if (!courier.isOnline) {
      showToast(
        'Você está OFFLINE. Mude manualmente para ONLINE antes de aceitar corridas.'
      );
      return;
    }

    const targetOrder =
      waitingOrders.find((o) => o.id === orderId) ||
      orders.find((o) => o.id === orderId);
    if (!targetOrder || targetOrder.status !== 'Aguardando') return;

    if (
      !isOrderCompatibleWithVehicle(
        targetOrder.type,
        courier.vehicleType,
        targetOrder.distanceKm,
        courier.bikeMaxRadiusKm,
        targetOrder.requestedVehicle
      )
    ) {
      showToast(
        `Pedido incompatível com seu veículo (${courier.vehicleType || 'não informado'}) ou acima do raio máximo configurado.`
      );
      return;
    }

    const propulsion = courier.propulsion || 'Combustão';
    const settlement = getCourierSettlementForOrder(
      targetOrder,
      propulsion,
      courier.vehicleType
    );

    try {
      const updatedOrder = await acceptDeliveryInSupabase(targetOrder, courier, {
        platformFee: settlement.platformFee,
        evBonus: settlement.evBonus,
        netPayout: settlement.netPayout,
        propulsion,
      });

      let enrichedOrder: Order = {
        ...updatedOrder,
        assignedCourierAvatarUrl:
          updatedOrder.assignedCourierAvatarUrl || courier.avatarUrl,
        assignedCourierVehicleType:
          updatedOrder.assignedCourierVehicleType || courier.vehicleType,
        assignedCourierVehicleModel:
          updatedOrder.assignedCourierVehicleModel || courier.vehicleModel,
        assignedCourierVehicleColor:
          updatedOrder.assignedCourierVehicleColor || courier.vehicleColor,
        assignedCourierPlate: updatedOrder.assignedCourierPlate || courier.plate,
      };
      if (!enrichedOrder.merchantPhone && targetOrder.merchantPhone) {
        enrichedOrder = {
          ...enrichedOrder,
          merchantPhone: targetOrder.merchantPhone,
        };
      } else if (!enrichedOrder.merchantPhone && enrichedOrder.merchantId) {
        const phoneMap = await fetchProfilesPhonesByIds([
          enrichedOrder.merchantId,
        ]);
        const foundPhone = phoneMap.get(enrichedOrder.merchantId);
        if (foundPhone) {
          enrichedOrder = { ...enrichedOrder, merchantPhone: foundPhone };
        }
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? enrichedOrder : o))
      );
      setWaitingOrders((prev) => prev.filter((o) => o.id !== orderId));
      showToast(
        `Trabalho aceito por ${courier.name} e atualizado para "em_rota" no Supabase.`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao aceitar trabalho no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleSendCourierQuickNotice = async (
    orderId: string,
    noticeType: CourierQuickNoticeType,
    stopSequence?: number
  ) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    try {
      const updatedOrder = await updateDeliveryQuickNoticeInSupabase({
        orderId,
        noticeType,
        stopSequence,
        profilesList:
          profilesRef.current.length > 0
            ? profilesRef.current
            : approvedCouriersRef.current,
      });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...updatedOrder,
                merchantPhone: updatedOrder.merchantPhone || o.merchantPhone,
              }
            : o
        )
      );

      showToast(
        `Aviso enviado ao cliente (${targetOrder.code}): ${getQuickNoticeMessage(
          noticeType
        )}`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao enviar aviso rápido no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleConfirmStop = async (
    orderId: string,
    stopId: string,
    receiverName: string,
    proofPhotoDataUrl?: string
  ) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const assignedCourier =
      (currentUser?.id === targetOrder.assignedCourierId
        ? currentUser
        : undefined) ||
      profiles.find((p) => p.id === targetOrder.assignedCourierId);

    try {
      const { updatedOrder, autoCompleted } =
        await confirmDeliveryStopInSupabase({
          order: targetOrder,
          stopId,
          receiverName,
          proofPhotoDataUrl,
          courier: assignedCourier,
        });

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updatedOrder : o))
      );

      if (autoCompleted) {
        const bonusMsg =
          (updatedOrder.evBonusApplied ?? 0) > 0 ? ' (com -50% Taxa Bike/EV)' : '';
        showToast(
          `Última parada confirmada! Pedido ${updatedOrder.code} finalizado${bonusMsg} no Supabase.`
        );
      } else {
        showToast(`Parada confirmada no Supabase para ${receiverName}.`);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar parada no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleCompleteOrder = async (orderId: string) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const allDone =
      targetOrder.stops.length > 0 &&
      targetOrder.stops.every((s) => s.delivered);
    if (!allDone) return;

    const assignedCourier =
      (currentUser?.id === targetOrder.assignedCourierId
        ? currentUser
        : undefined) ||
      profiles.find((p) => p.id === targetOrder.assignedCourierId);

    try {
      const updatedOrder = await completeDeliveryInSupabase(
        orderId,
        assignedCourier
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updatedOrder : o))
      );
      const bonusMsg =
        (updatedOrder.evBonusApplied ?? 0) > 0 ? ' (com -50% Taxa Bike/EV)' : '';
      showToast(
        `Rota ${updatedOrder.code} finalizada${bonusMsg} no Supabase!`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao finalizar entrega no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleUpdateApproval = async (
    profileId: string,
    status: ApprovalStatus
  ) => {
    try {
      const updated = await updateProfileStatusInSupabase(profileId, status);
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? updated : p))
      );

      const couriers = await fetchApprovedCouriers();
      setApprovedCouriers(couriers);

      if (
        status === 'Aprovado' &&
        (updated.role === 'entregador' || updated.role === 'motorista')
      ) {
        setActiveCourierId(updated.id);
      }
      if (status === 'Aprovado' && updated.role === 'lojista') {
        setActiveMerchantId(updated.id);
      }

      const displayName = updated.businessName || updated.name;
      showToast(
        status === 'Aprovado'
          ? `${displayName} aprovado(a) no Supabase.`
          : `${displayName} bloqueado(a) no Supabase.`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar status no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleUpdateBikeRadius = async (
    courierId: string,
    radiusKm: number | null
  ) => {
    try {
      const updated = await updateBikeMaxRadiusInSupabase(courierId, radiusKm);
      setProfiles((prev) =>
        prev.map((p) => (p.id === courierId ? updated : p))
      );
      setApprovedCouriers((prev) =>
        prev.map((p) => (p.id === courierId ? updated : p))
      );
      if (currentUser?.id === courierId) {
        setCurrentUser(updated);
      }
      showToast(
        radiusKm === null
          ? 'Raio máximo de Bike atualizado para Sem limite no Supabase.'
          : `Raio máximo de Bike atualizado para até ${radiusKm} km no Supabase.`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar raio máximo da Bike.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleConfirmMerchantPixPayment = async (orderId: string) => {
    const knownProfiles = profiles.length > 0 ? profiles : approvedCouriers;
    try {
      const updatedOrder = await updateDeliveryPaymentStatusInSupabase(
        orderId,
        'pago_lojista',
        knownProfiles
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updatedOrder : o))
      );
      showToast(
        `Pagamento Pix do pedido ${updatedOrder.code} confirmado no Supabase!`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao confirmar pagamento Pix no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleMarkAdminRepasseDone = async (orderId: string) => {
    if (currentUser?.role !== 'admin') return;
    const knownProfiles = profiles.length > 0 ? profiles : approvedCouriers;
    try {
      const updatedOrder = await updateDeliveryPaymentStatusInSupabase(
        orderId,
        'repassado',
        knownProfiles
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updatedOrder : o))
      );
      showToast(
        `Repasse do pedido ${updatedOrder.code} marcado como concluído no Supabase!`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar repasse no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleUpdatePlatformPixKey = async (pixKey: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      const updated = await updatePixKeyInSupabase(currentUser.id, pixKey);
      setCurrentUser(updated);
      setProfiles((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setPlatformPixKey(updated.pixKey || null);
      showToast('Chave Pix oficial do RotaJusta atualizada no Supabase.');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao salvar Chave Pix oficial.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleUpdateCourierPixKey = async (
    courierId: string,
    pixKey: string
  ) => {
    if (
      !currentUser ||
      (currentUser.role !== 'admin' && currentUser.id !== courierId)
    ) {
      return;
    }
    try {
      const updated = await updatePixKeyInSupabase(courierId, pixKey);
      setProfiles((prev) =>
        prev.map((p) => (p.id === courierId ? updated : p))
      );
      setApprovedCouriers((prev) =>
        prev.map((c) => (c.id === courierId ? updated : c))
      );
      if (currentUser.id === courierId) {
        setCurrentUser(updated);
      }
      showToast('Sua Chave Pix foi atualizada no Supabase!');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao atualizar Chave Pix.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleConfirmCourierPixReceipt = async (orderId: string) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (
      !currentUser ||
      !targetOrder ||
      (currentUser.role !== 'admin' &&
        targetOrder.assignedCourierId !== currentUser.id)
    ) {
      return;
    }
    const knownProfiles = profiles.length > 0 ? profiles : approvedCouriers;
    try {
      const updatedOrder = await updateDeliveryPaymentStatusInSupabase(
        orderId,
        'repassado',
        knownProfiles
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updatedOrder : o))
      );
      showToast(
        `Recebimento Pix da corrida ${updatedOrder.code} confirmado no Supabase!`
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao confirmar recebimento do Pix.';
      showToast(`Erro Supabase: ${msg}`);
    }
  };

  const handleEditProfile = async (input: AdminProfileUpdateInput) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const updated = await adminUpdateProfileInSupabase(input);
    setProfiles((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    const couriers = await fetchApprovedCouriers();
    setApprovedCouriers(couriers);
    if (updated.id === currentUser.id) {
      setCurrentUser(updated);
      if (updated.role === 'admin') {
        setPlatformPixKey(updated.pixKey || null);
      }
    }
    showToast(`Cadastro de ${updated.name} atualizado no Supabase.`);
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    await adminDeleteProfileInSupabase({
      profileId,
      currentAdminId: currentUser.id,
    });
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    setApprovedCouriers((prev) => prev.filter((c) => c.id !== profileId));
    setActiveCourierId((prev) => (prev === profileId ? '' : prev));
    setActiveMerchantId((prev) => (prev === profileId ? '' : prev));
    showToast('Usuário removido permanentemente do Supabase.');
  };

  const handleSubmitRating = async (params: {
    deliveryId: string;
    fromProfileId: string;
    toProfileId: string;
    stars: number;
    comment?: string;
  }) => {
    const result = await submitRatingInSupabase(params);
    setRatings((prev) => [result.rating, ...prev]);

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === result.targetProfileId
          ? {
              ...p,
              ratingAvg: result.ratingAvg,
              ratingCount: result.ratingCount,
            }
          : p
      )
    );
    setApprovedCouriers((prev) =>
      prev.map((c) =>
        c.id === result.targetProfileId
          ? {
              ...c,
              ratingAvg: result.ratingAvg,
              ratingCount: result.ratingCount,
            }
          : c
      )
    );
    if (currentUser?.id === result.targetProfileId) {
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              ratingAvg: result.ratingAvg,
              ratingCount: result.ratingCount,
            }
          : prev
      );
    }

    const patchOrderRatings = (ord: Order): Order => ({
      ...ord,
      merchantRatingAvg:
        ord.merchantId === result.targetProfileId
          ? result.ratingAvg
          : ord.merchantRatingAvg,
      merchantRatingCount:
        ord.merchantId === result.targetProfileId
          ? result.ratingCount
          : ord.merchantRatingCount,
      assignedCourierRatingAvg:
        ord.assignedCourierId === result.targetProfileId
          ? result.ratingAvg
          : ord.assignedCourierRatingAvg,
      assignedCourierRatingCount:
        ord.assignedCourierId === result.targetProfileId
          ? result.ratingCount
          : ord.assignedCourierRatingCount,
    });

    setOrders((prev) => prev.map(patchOrderRatings));
    setWaitingOrders((prev) => prev.map(patchOrderRatings));

    showToast(
      `Avaliação de ${result.rating.stars} estrela(s) salva no Supabase!`
    );
  };

  const handleSeedTestData = async () => {
    setIsSeeding(true);
    try {
      await seedInitialSupabaseData();
      setIsDatabaseEmpty(false);
      if (currentUser) {
        await loadRoleWorkspaceData(currentUser, true);
      }
      showToast(
        'Dados iniciais carregados! Admin (usuário "admin", PIN 1234) + 2 condutores (PIN 1234) e 2 pedidos em POA.'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao popular dados iniciais no Supabase.';
      setDbError(msg);
      showToast(`Erro Supabase: ${msg}`);
    } finally {
      setIsSeeding(false);
    }
  };

  // Show Landing Page or Login / Signup gate when no user is logged into the session
  if (!currentUser) {
    return (
      <>
        {unauthView === 'landing' ? (
          <LandingPage
            onlineCouriersCount={landingOnlineCouriersCount}
            isLoadingOnlineCount={isLoadingOnlineCount}
            isDatabaseEmpty={isDatabaseEmpty}
            isCheckingEmpty={isCheckingEmpty}
            isSeeding={isSeeding}
            dbError={dbError}
            onOpenLogin={handleOpenLogin}
            onOpenRegister={handleOpenRegister}
            onSeedTestData={handleSeedTestData}
          />
        ) : (
          <AuthScreen
            onLoginSuccess={handleLoginSuccess}
            isDatabaseEmpty={isDatabaseEmpty}
            isCheckingEmpty={isCheckingEmpty}
            isSeeding={isSeeding}
            dbError={dbError}
            onSeedTestData={handleSeedTestData}
            onRetryConnection={checkEmptyState}
            initialTab={authInitialTab}
            initialRegChoice={authInitialRegChoice}
            onBackToLanding={() => {
              setUnauthView('landing');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
        <OfflineIndicator />
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-xl border border-emerald-200 bg-zinc-900 px-4 py-3 text-xs font-medium text-white shadow-lg"
          >
            <CheckCircle2
              className="h-4 w-4 text-emerald-400 shrink-0"
              aria-hidden="true"
            />
            <span className="flex-1">{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Fechar aviso"
              className="rounded p-0.5 text-zinc-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </>
    );
  }

  const isAdmin = currentUser.role === 'admin';
  const isMerchant = currentUser.role === 'lojista';
  const isApprovedCourier =
    (currentUser.role === 'entregador' || currentUser.role === 'motorista') &&
    currentUser.approvalStatus === 'Aprovado';
  const isCourierViewport =
    isApprovedCourier || (isAdmin && adminView === 'entregador');

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      <Header
        currentUser={currentUser}
        adminView={adminView}
        onSelectAdminView={handleSelectAdminView}
        pendingApprovalsCount={pendingApprovalsCount}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        onLogout={handleLogout}
      />

      <main
        className={`mx-auto w-full flex-1 px-4 py-5 sm:px-6 sm:py-8 space-y-6 ${
          isCourierViewport ? 'max-w-5xl' : 'max-w-[1440px]'
        }`}
      >
        {newOfferBanner && activeSupervisedOrLoggedCourier?.isOnline && (
          <div
            role="alert"
            className="rounded-xl border-2 border-emerald-500 bg-emerald-600 px-4 py-3.5 text-white shadow-lg animate-pulse flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <BellRing className="h-5 w-5 text-white shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5 text-xs">
                <p className="text-sm font-bold tracking-tight">
                  RotaJusta! Nova oferta de entrega disponível ({newOfferBanner.code})
                </p>
                <p className="text-emerald-50">
                  {newOfferBanner.type === 'frete'
                    ? 'Pequeno Frete'
                    : newOfferBanner.type === 'rota'
                    ? `Rota Consolidada (${newOfferBanner.packageCount} pacotes)`
                    : 'Entrega Rápida'}
                  {newOfferBanner.distanceKm !== undefined
                    ? ` · ${newOfferBanner.distanceKm} km`
                    : ''}{' '}
                  · {newOfferBanner.pickupNeighborhood} →{' '}
                  {newOfferBanner.destinationNeighborhood} · Ganho líquido base:{' '}
                  <strong className="font-mono">
                    {formatBRL(newOfferBanner.basePayout)}
                  </strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewOfferBanner(null)}
              className="rounded-lg border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25 self-start sm:self-center shrink-0"
            >
              Ciente
            </button>
          </div>
        )}

        {dbError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs text-red-900 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className="h-4 w-4 text-red-600 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <p className="font-semibold">Erro de conexão com o Supabase</p>
                <p className="text-red-800">{dbError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadRoleWorkspaceData(currentUser, false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800 hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tentar novamente</span>
            </button>
          </div>
        )}

        {isAdmin && adminView !== 'admin' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs text-emerald-950 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                <strong>Modo Supervisão (Admin):</strong> você está inspecionando a
                visão de{' '}
                {adminView === 'lojista' ? 'Painel do Lojista' : 'Mural do Entregador'}.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSelectAdminView('admin')}
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-semibold text-emerald-800 hover:bg-emerald-100 shrink-0"
            >
              Voltar ao Admin
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-12 flex flex-col items-center justify-center gap-3 text-sm text-zinc-600">
            <Loader2
              className="h-6 w-6 animate-spin text-emerald-600"
              aria-hidden="true"
            />
            <span>Carregando dados do Supabase...</span>
          </div>
        ) : (
          <>
            {/* Role 1: Lojista -> exclusively Painel do Lojista */}
            {isMerchant && (
              <MerchantPanel
                lockedMerchant={currentUser}
                currentEvaluatorId={currentUser.id}
                orders={orders}
                merchants={merchants}
                onlineCouriers={onlineCouriers}
                ratings={ratings}
                activeMerchantId={currentUser.id}
                platformPixKey={platformPixKey}
                onSelectMerchant={setActiveMerchantId}
                onCreateOrder={handleCreateOrder}
                onConfirmPixPayment={handleConfirmMerchantPixPayment}
                onSubmitRating={handleSubmitRating}
                formRef={merchantFormRef}
              />
            )}

            {/* Role 2: Approved Entregador/Motorista -> exclusively Mural bound to their own profile */}
            {isApprovedCourier && (
              <CourierBoard
                lockedCourier={currentUser}
                approvedCouriers={[currentUser]}
                pendingCouriersCount={0}
                waitingOrders={waitingOrders}
                orders={orders}
                ratings={ratings}
                activeCourierId={currentUser.id}
                onSelectCourier={setActiveCourierId}
                onAcceptOrder={handleAcceptOrder}
                onSendQuickNotice={handleSendCourierQuickNotice}
                onConfirmStop={handleConfirmStop}
                onCompleteOrder={handleCompleteOrder}
                onUpdateBikeRadius={handleUpdateBikeRadius}
                onToggleOnlineStatus={handleToggleOnlineStatus}
                onTestSoundAlert={handleTestSoundAlert}
                onUpdateCourierPixKey={handleUpdateCourierPixKey}
                onConfirmCourierPixReceipt={handleConfirmCourierPixReceipt}
                onCourierProfileUpdated={(updated) =>
                  handleAccountUpdated(
                    updated,
                    'Foto e dados do veículo atualizados no Supabase!'
                  )
                }
                onSubmitRating={handleSubmitRating}
              />
            )}

            {/* Role 3: Admin -> AdminPanel + Supervision Switch */}
            {isAdmin && adminView === 'admin' && (
              <AdminPanel
                currentAdminId={currentUser.id}
                profiles={profiles}
                orders={orders}
                ratings={ratings}
                platformPixKey={platformPixKey}
                isDatabaseEmpty={isDatabaseEmpty}
                isSeeding={isSeeding}
                onUpdateApproval={handleUpdateApproval}
                onEditProfile={handleEditProfile}
                onDeleteProfile={handleDeleteProfile}
                onRefreshData={() => loadRoleWorkspaceData(currentUser, false)}
                onSeedTestData={handleSeedTestData}
                onUpdatePlatformPixKey={handleUpdatePlatformPixKey}
                onMarkRepasseDone={handleMarkAdminRepasseDone}
              />
            )}

            {isAdmin && adminView === 'lojista' && (
              <MerchantPanel
                currentEvaluatorId={activeMerchantId || currentUser.id}
                orders={orders}
                merchants={merchants}
                onlineCouriers={onlineCouriers}
                ratings={ratings}
                activeMerchantId={activeMerchantId}
                platformPixKey={platformPixKey}
                onSelectMerchant={setActiveMerchantId}
                onCreateOrder={handleCreateOrder}
                onConfirmPixPayment={handleConfirmMerchantPixPayment}
                onSubmitRating={handleSubmitRating}
                formRef={merchantFormRef}
              />
            )}

            {isAdmin && adminView === 'entregador' && (
              <CourierBoard
                approvedCouriers={approvedCouriers}
                pendingCouriersCount={pendingCouriersCount}
                waitingOrders={waitingOrders}
                orders={orders}
                ratings={ratings}
                activeCourierId={activeCourierId}
                onSelectCourier={setActiveCourierId}
                onAcceptOrder={handleAcceptOrder}
                onSendQuickNotice={handleSendCourierQuickNotice}
                onConfirmStop={handleConfirmStop}
                onCompleteOrder={handleCompleteOrder}
                onUpdateBikeRadius={handleUpdateBikeRadius}
                onToggleOnlineStatus={handleToggleOnlineStatus}
                onTestSoundAlert={handleTestSoundAlert}
                onUpdateCourierPixKey={handleUpdateCourierPixKey}
                onConfirmCourierPixReceipt={handleConfirmCourierPixReceipt}
                onCourierProfileUpdated={(updated) =>
                  handleAccountUpdated(
                    updated,
                    'Foto e dados do veículo atualizados no Supabase!'
                  )
                }
                onSubmitRating={handleSubmitRating}
              />
            )}
          </>
        )}
      </main>

      <footer
        className={`border-t border-zinc-200 bg-white ${
          isCourierViewport ? 'hidden md:block' : ''
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            <strong className="font-semibold text-zinc-800">RotaJusta</strong> ·
            Entregas urbanas e mobilidade justa em Porto Alegre (RS)
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
            <span className="hidden sm:inline text-zinc-400">·</span>
            <span>
              Taxa transparente por modal · 50% de desconto na taxa para bicicletas e
              veículos elétricos
            </span>
          </div>
        </div>
      </footer>

      {legalModalTab && (
        <LegalModal
          initialTab={legalModalTab}
          onClose={() => setLegalModalTab(null)}
        />
      )}

      {isAccountModalOpen && (
        <MyAccountModal
          currentUser={currentUser}
          onClose={() => setIsAccountModalOpen(false)}
          onProfileUpdated={handleAccountUpdated}
        />
      )}

      <OfflineIndicator />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-xl border border-emerald-200 bg-zinc-900 px-4 py-3 text-xs font-medium text-white shadow-lg ${
            isCourierViewport ? 'bottom-20 md:bottom-4' : 'bottom-4'
          }`}
        >
          <CheckCircle2
            className="h-4 w-4 text-emerald-400 shrink-0"
            aria-hidden="true"
          />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fechar aviso"
            className="rounded p-0.5 text-zinc-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
