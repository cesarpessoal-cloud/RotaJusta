import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { AuthScreen } from './components/AuthScreen';
import { CourierBoard } from './components/CourierBoard';
import { AdminSupervisionView, Header } from './components/Header';
import { MerchantPanel } from './components/MerchantPanel';
import { MyAccountModal } from './components/MyAccountModal';
import { isSupabaseConfigured } from './lib/supabase';
import {
  acceptDeliveryInSupabase,
  checkIfDatabaseIsEmpty,
  completeDeliveryInSupabase,
  confirmDeliveryStopInSupabase,
  createDeliveryInSupabase,
  fetchAllDeliveries,
  fetchAllProfiles,
  fetchApprovedCouriers,
  fetchPlatformPixKey,
  fetchWaitingDeliveries,
  seedInitialSupabaseData,
  updateBikeMaxRadiusInSupabase,
  updateDeliveryPaymentStatusInSupabase,
  updatePixKeyInSupabase,
  updateProfileStatusInSupabase,
} from './lib/supabaseService';
import { ApprovalStatus, Order, Profile } from './types';
import { getCourierSettlementForOrder } from './utils/pricing';
import { isOrderCompatibleWithVehicle } from './utils/vehicleCompatibility';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [adminView, setAdminView] = useState<AdminSupervisionView>('admin');

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [approvedCouriers, setApprovedCouriers] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [waitingOrders, setWaitingOrders] = useState<Order[]>([]);
  const [platformPixKey, setPlatformPixKey] = useState<string | null>(null);
  const [activeCourierId, setActiveCourierId] = useState<string>('');
  const [activeMerchantId, setActiveMerchantId] = useState<string>('');

  const [isDatabaseEmpty, setIsDatabaseEmpty] = useState<boolean>(false);
  const [isCheckingEmpty, setIsCheckingEmpty] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const merchantFormRef = useRef<HTMLFormElement | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
          const [allProfiles, couriers] = await Promise.all([
            fetchAllProfiles(),
            fetchApprovedCouriers(),
          ]);

          const [allDeliveries, waitingDeliveries] = await Promise.all([
            fetchAllDeliveries(allProfiles),
            fetchWaitingDeliveries(allProfiles),
          ]);

          setProfiles(allProfiles);
          setApprovedCouriers(couriers);
          setOrders(allDeliveries);
          setWaitingOrders(waitingDeliveries);
          const adminProf = allProfiles.find((p) => p.role === 'admin');
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
          const [couriers, officialPix] = await Promise.all([
            fetchApprovedCouriers(),
            fetchPlatformPixKey(),
          ]);
          const enriched = await fetchAllDeliveries(couriers);
          setProfiles(couriers);
          setApprovedCouriers(couriers);
          setOrders(enriched);
          setPlatformPixKey(officialPix);
          setActiveMerchantId(user.id);
        } else {
          // Entregador / Motorista aprovado
          const [allDeliveries, waitingDeliveries] = await Promise.all([
            fetchAllDeliveries([user]),
            fetchWaitingDeliveries([user]),
          ]);
          setApprovedCouriers([user]);
          setOrders(allDeliveries);
          setWaitingOrders(waitingDeliveries);
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
    setAdminView('admin');
    setIsAccountModalOpen(false);
    setProfiles([]);
    setApprovedCouriers([]);
    setOrders([]);
    setWaitingOrders([]);
    setPlatformPixKey(null);
    setDbError(null);
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

  const handleCreateOrder = async (
    newOrder: Order
  ): Promise<{ order: Order | null; errorMessage?: string }> => {
    try {
      const savedOrder = await createDeliveryInSupabase(newOrder);
      setOrders((prev) => [savedOrder, ...prev]);
      setWaitingOrders((prev) => [savedOrder, ...prev]);
      showToast(
        `Pedido ${savedOrder.code} gravado no Supabase para ${savedOrder.destinationNeighborhood}.`
      );
      return { order: savedOrder };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao publicar pedido no Supabase.';
      showToast(`Erro Supabase: ${msg}`);
      return { order: null, errorMessage: msg };
    }
  };

  const handleAcceptOrder = async (orderId: string, courier: Profile) => {
    const targetOrder =
      waitingOrders.find((o) => o.id === orderId) ||
      orders.find((o) => o.id === orderId);
    if (!targetOrder || targetOrder.status !== 'Aguardando') return;

    if (
      !isOrderCompatibleWithVehicle(
        targetOrder.type,
        courier.vehicleType,
        targetOrder.distanceKm,
        courier.bikeMaxRadiusKm
      )
    ) {
      showToast(
        `Pedido incompatível com seu veículo (${courier.vehicleType || 'não informado'}) ou acima do raio máximo configurado.`
      );
      return;
    }

    const propulsion = courier.propulsion || 'Combustão';
    const settlement = getCourierSettlementForOrder(targetOrder, propulsion);

    try {
      const updatedOrder = await acceptDeliveryInSupabase(targetOrder, courier, {
        platformFee: settlement.platformFee,
        evBonus: settlement.evBonus,
        netPayout: settlement.netPayout,
        propulsion,
      });

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? updatedOrder : o))
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
          (updatedOrder.evBonusApplied ?? 0) > 0 ? ' (com Bônus EV)' : '';
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
        (updatedOrder.evBonusApplied ?? 0) > 0 ? ' (com Bônus EV)' : '';
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

  // Show Login / Signup gate when no user is logged into the session
  if (!currentUser) {
    return (
      <>
        <AuthScreen
          onLoginSuccess={handleLoginSuccess}
          isDatabaseEmpty={isDatabaseEmpty}
          isCheckingEmpty={isCheckingEmpty}
          isSeeding={isSeeding}
          dbError={dbError}
          onSeedTestData={handleSeedTestData}
          onRetryConnection={checkEmptyState}
        />
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 space-y-6">
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
                orders={orders}
                merchants={merchants}
                activeMerchantId={currentUser.id}
                platformPixKey={platformPixKey}
                onSelectMerchant={setActiveMerchantId}
                onCreateOrder={handleCreateOrder}
                onConfirmPixPayment={handleConfirmMerchantPixPayment}
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
                activeCourierId={currentUser.id}
                onSelectCourier={setActiveCourierId}
                onAcceptOrder={handleAcceptOrder}
                onConfirmStop={handleConfirmStop}
                onCompleteOrder={handleCompleteOrder}
                onUpdateBikeRadius={handleUpdateBikeRadius}
              />
            )}

            {/* Role 3: Admin -> AdminPanel + Supervision Switch */}
            {isAdmin && adminView === 'admin' && (
              <AdminPanel
                profiles={profiles}
                orders={orders}
                platformPixKey={platformPixKey}
                isDatabaseEmpty={isDatabaseEmpty}
                isSeeding={isSeeding}
                onUpdateApproval={handleUpdateApproval}
                onRefreshData={() => loadRoleWorkspaceData(currentUser, false)}
                onSeedTestData={handleSeedTestData}
                onUpdatePlatformPixKey={handleUpdatePlatformPixKey}
                onMarkRepasseDone={handleMarkAdminRepasseDone}
              />
            )}

            {isAdmin && adminView === 'lojista' && (
              <MerchantPanel
                orders={orders}
                merchants={merchants}
                activeMerchantId={activeMerchantId}
                platformPixKey={platformPixKey}
                onSelectMerchant={setActiveMerchantId}
                onCreateOrder={handleCreateOrder}
                onConfirmPixPayment={handleConfirmMerchantPixPayment}
                formRef={merchantFormRef}
              />
            )}

            {isAdmin && adminView === 'entregador' && (
              <CourierBoard
                approvedCouriers={approvedCouriers}
                pendingCouriersCount={pendingCouriersCount}
                waitingOrders={waitingOrders}
                orders={orders}
                activeCourierId={activeCourierId}
                onSelectCourier={setActiveCourierId}
                onAcceptOrder={handleAcceptOrder}
                onConfirmStop={handleConfirmStop}
                onCompleteOrder={handleCompleteOrder}
                onUpdateBikeRadius={handleUpdateBikeRadius}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            <strong className="font-semibold text-zinc-800">RotaJusta</strong> ·
            Entregas urbanas e mobilidade justa em Porto Alegre (RS)
          </p>
          <p>
            Taxa fixa transparente · 100% da taxa revertida como bônus para veículos
            elétricos e bikes
          </p>
        </div>
      </footer>

      {isAccountModalOpen && (
        <MyAccountModal
          currentUser={currentUser}
          onClose={() => setIsAccountModalOpen(false)}
          onProfileUpdated={handleAccountUpdated}
        />
      )}

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
    </div>
  );
}
