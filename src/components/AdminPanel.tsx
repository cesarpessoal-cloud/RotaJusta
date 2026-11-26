import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Pencil,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { AdminProfileUpdateInput } from '../lib/supabaseService';
import {
  ApprovalStatus,
  Order,
  PaymentStatus,
  PersonType,
  PixKeyType,
  Profile,
  PropulsionType,
  Rating,
  UserRole,
  VehicleType,
} from '../types';
import {
  formatPaymentMethodLabel,
  getPixKeyPlaceholder,
  inferPixKeyType,
  PIX_KEY_TYPES,
} from '../utils/pix';
import {
  formatCnpjMask,
  formatCpfMask,
  formatCpfOrCnpj,
  onlyDigits,
} from '../utils/documentValidation';
import { formatBRL, formatDateTimeBR, isZeroFeePropulsion } from '../utils/pricing';
import {
  BIKE_RADIUS_OPTIONS,
  getPropulsionOptionsForVehicle,
  VEHICLE_CATEGORIES,
} from '../utils/vehicleCompatibility';
import {
  ApprovalStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PropulsionTag,
} from './EvBadge';
import { RatingBadge } from './RatingWidgets';

interface AdminPanelProps {
  currentAdminId: string;
  profiles: Profile[];
  orders: Order[];
  ratings: Rating[];
  platformPixKey: string | null;
  isDatabaseEmpty: boolean;
  isSeeding: boolean;
  onUpdateApproval: (profileId: string, status: ApprovalStatus) => Promise<void>;
  onEditProfile: (input: AdminProfileUpdateInput) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onRefreshData: () => Promise<void>;
  onSeedTestData: () => Promise<void>;
  onUpdatePlatformPixKey: (pixKey: string) => Promise<void>;
  onMarkRepasseDone: (orderId: string) => Promise<void>;
}

type AdminSectionTab = 'operacao' | 'financeiro' | 'avaliacoes';

export function AdminPanel({
  currentAdminId,
  profiles,
  orders,
  ratings,
  platformPixKey,
  isDatabaseEmpty,
  isSeeding,
  onUpdateApproval,
  onEditProfile,
  onDeleteProfile,
  onRefreshData,
  onSeedTestData,
  onUpdatePlatformPixKey,
  onMarkRepasseDone,
}: AdminPanelProps) {
  const [adminTab, setAdminTab] = useState<AdminSectionTab>('operacao');
  const [statusFilter, setStatusFilter] = useState<'Todos' | ApprovalStatus>(
    'Todos'
  );
  const [paymentFilter, setPaymentFilter] = useState<'Todos' | PaymentStatus>(
    'Todos'
  );
  const [officialPixType, setOfficialPixType] = useState<PixKeyType>(() =>
    inferPixKeyType(platformPixKey)
  );
  const [officialPixInput, setOfficialPixInput] = useState<string>(
    platformPixKey || ''
  );
  const [isSavingOfficialPix, setIsSavingOfficialPix] = useState(false);
  const [officialPixMsg, setOfficialPixMsg] = useState<string | null>(null);
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);
  const [processingRepasseId, setProcessingRepasseId] = useState<string | null>(
    null
  );

  // Edit User Modal state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('entregador');
  const [editPersonType, setEditPersonType] = useState<PersonType>('PF');
  const [editDocument, setEditDocument] = useState('');
  const [editCompanyLegalName, setEditCompanyLegalName] = useState('');
  const [editStatus, setEditStatus] = useState<ApprovalStatus>('Aprovado');
  const [editAccessPin, setEditAccessPin] = useState('');
  const [editPixKey, setEditPixKey] = useState('');
  const [editVehicleType, setEditVehicleType] = useState<VehicleType>('Moto');
  const [editPropulsion, setEditPropulsion] =
    useState<PropulsionType>('Elétrico');
  const [editBikeRadiusKm, setEditBikeRadiusKm] = useState<number | null>(3);
  const [editHasEar, setEditHasEar] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete Confirmation Modal state
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setOfficialPixInput(platformPixKey || '');
    if (platformPixKey) {
      setOfficialPixType(inferPixKeyType(platformPixKey));
    }
  }, [platformPixKey]);

  const pendingProfiles = useMemo(
    () => profiles.filter((p) => p.approvalStatus === 'Aguardando Aprovação'),
    [profiles]
  );

  const approvedDriversCount = useMemo(
    () =>
      profiles.filter(
        (p) =>
          (p.role === 'entregador' || p.role === 'motorista') &&
          p.approvalStatus === 'Aprovado'
      ).length,
    [profiles]
  );

  const onlineDriversCount = useMemo(
    () =>
      profiles.filter(
        (p) =>
          (p.role === 'entregador' || p.role === 'motorista') &&
          p.approvalStatus === 'Aprovado' &&
          Boolean(p.isOnline)
      ).length,
    [profiles]
  );

  const totalEvIncentive = useMemo(
    () => orders.reduce((acc, ord) => acc + (ord.evBonusApplied ?? 0), 0),
    [orders]
  );

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === 'Entregue'),
    [orders]
  );

  const financialSummary = useMemo(() => {
    const totalGross = completedOrders.reduce((acc, o) => acc + o.grossTotal, 0);
    const pendingRepasseOrders = completedOrders.filter(
      (o) => o.paymentStatus !== 'repassado'
    );
    const pendingRepasseAmount = pendingRepasseOrders.reduce(
      (acc, o) => acc + (o.netCourierPayout ?? o.basePayout),
      0
    );
    const settledOrders = completedOrders.filter(
      (o) => o.paymentStatus === 'repassado'
    );
    const settledAmount = settledOrders.reduce(
      (acc, o) => acc + (o.netCourierPayout ?? o.basePayout),
      0
    );
    const totalPlatformFees = completedOrders.reduce(
      (acc, o) => acc + (o.appliedPlatformFee ?? o.standardPlatformFee),
      0
    );
    return {
      totalGross,
      pendingCount: pendingRepasseOrders.length,
      pendingRepasseAmount,
      settledCount: settledOrders.length,
      settledAmount,
      totalPlatformFees,
    };
  }, [completedOrders]);

  const filteredCompletedOrders = useMemo(() => {
    if (paymentFilter === 'Todos') return completedOrders;
    return completedOrders.filter(
      (o) => (o.paymentStatus || 'pendente_pagamento') === paymentFilter
    );
  }, [completedOrders, paymentFilter]);

  const filteredProfiles = useMemo(() => {
    if (statusFilter === 'Todos') return profiles;
    return profiles.filter((p) => p.approvalStatus === statusFilter);
  }, [profiles, statusFilter]);

  const handleSaveOfficialPix = async (e: React.FormEvent) => {
    e.preventDefault();
    setOfficialPixMsg(null);
    setIsSavingOfficialPix(true);
    try {
      await onUpdatePlatformPixKey(officialPixInput.trim());
      setOfficialPixMsg('Chave Pix oficial do RotaJusta atualizada no Supabase.');
    } finally {
      setIsSavingOfficialPix(false);
    }
  };

  const handleCopyCourierPix = async (id: string, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedPixId(id);
      window.setTimeout(() => setCopiedPixId(null), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleRepasseClick = async (orderId: string) => {
    setProcessingRepasseId(orderId);
    try {
      await onMarkRepasseDone(orderId);
    } finally {
      setProcessingRepasseId(null);
    }
  };

  const openEditModal = (profile: Profile) => {
    setEditingProfile(profile);
    setEditName(profile.name || '');
    setEditPhone(profile.phone || '');
    setEditEmail(profile.email || '');
    setEditRole(profile.role);
    const inferredPersonType: PersonType =
      profile.personType ||
      (onlyDigits(profile.documentNumber || profile.document).length === 14
        ? 'PJ'
        : 'PF');
    setEditPersonType(inferredPersonType);
    setEditDocument(
      formatCpfOrCnpj(
        profile.documentNumber || profile.document,
        inferredPersonType
      )
    );
    setEditCompanyLegalName(profile.companyLegalName || '');
    setEditStatus(profile.approvalStatus);
    setEditAccessPin('');
    setEditPixKey(profile.pixKey || '');
    const vType: VehicleType = profile.vehicleType || 'Moto';
    setEditVehicleType(vType);
    const allowedProps = getPropulsionOptionsForVehicle(vType);
    const currentProp = profile.propulsion;
    setEditPropulsion(
      currentProp && allowedProps.includes(currentProp)
        ? currentProp
        : allowedProps[0]
    );
    setEditBikeRadiusKm(
      profile.bikeMaxRadiusKm === undefined ? 3 : profile.bikeMaxRadiusKm
    );
    setEditHasEar(Boolean(profile.hasEar));
    setEditError(null);
  };

  const handleEditVehicleChange = (nextVehicle: VehicleType) => {
    setEditVehicleType(nextVehicle);
    const allowed = getPropulsionOptionsForVehicle(nextVehicle);
    if (!allowed.includes(editPropulsion)) {
      setEditPropulsion(allowed[0]);
    }
    if (nextVehicle === 'Bike' && editBikeRadiusKm === undefined) {
      setEditBikeRadiusKm(3);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    setEditError(null);

    if (!editName.trim() || !editPhone.trim()) {
      setEditError('Nome e telefone/usuário de acesso são obrigatórios.');
      return;
    }
    if (editAccessPin.trim() && !/^\d{4}$/.test(editAccessPin.trim())) {
      setEditError('O novo PIN deve conter exatamente 4 dígitos numéricos.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await onEditProfile({
        profileId: editingProfile.id,
        name: editName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        role: editRole,
        personType: editPersonType,
        documentNumber: editDocument,
        companyLegalName: editCompanyLegalName.trim(),
        approvalStatus: editStatus,
        accessPin: editAccessPin.trim() || undefined,
        pixKey: editPixKey.trim(),
        vehicleType:
          editRole === 'entregador' || editRole === 'motorista'
            ? editVehicleType
            : null,
        propulsion:
          editRole === 'entregador' || editRole === 'motorista'
            ? editPropulsion
            : null,
        bikeMaxRadiusKm:
          (editRole === 'entregador' || editRole === 'motorista') &&
          editVehicleType === 'Bike'
            ? editBikeRadiusKm
            : null,
        hasEar:
          editRole === 'entregador' || editRole === 'motorista'
            ? editHasEar
            : false,
      });
      setEditingProfile(null);
    } catch (err) {
      setEditError(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar cadastro no Supabase.'
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProfile) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await onDeleteProfile(deletingProfile.id);
      setDeletingProfile(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Não foi possível excluir este usuário.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p] as const)),
    [profiles]
  );

  const orderById = useMemo(
    () => new Map(orders.map((o) => [o.id, o] as const)),
    [orders]
  );

  const ratingsSummary = useMemo(() => {
    if (ratings.length === 0) {
      return { count: 0, avg: 0, fiveStarCount: 0 };
    }
    const sum = ratings.reduce((acc, r) => acc + r.stars, 0);
    const fiveStarCount = ratings.filter((r) => r.stars === 5).length;
    return {
      count: ratings.length,
      avg: Number((sum / ratings.length).toFixed(1)),
      fiveStarCount,
    };
  }, [ratings]);

  const roleLabel = (profile: Profile) => {
    if (profile.role === 'admin') return 'Administrador';
    if (profile.role === 'lojista') {
      return profile.personType === 'PF'
        ? 'Solicitante PF (Entregas / Frete)'
        : 'Empresa / Lojista (PJ)';
    }
    if (profile.role === 'motorista') {
      return 'Motorista de Passageiros (Passe Diário R$ 20,00)';
    }
    return 'Entregador (PF)';
  };

  return (
    <div className="space-y-8">
      {/* Header & Reset Demo Action */}
      <section className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-emerald-700">
            Governança e Operações · Porto Alegre
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Admin (Aprovações)
          </h1>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Analise os cadastros de entregadores e motoristas com todos os dados de
            veículo, propulsão e CNH/EAR, e aprove ou bloqueie com um clique.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isDatabaseEmpty && (
            <button
              type="button"
              disabled={isSeeding}
              onClick={onSeedTestData}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
            >
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {isSeeding
                  ? 'Carregando...'
                  : 'Carregar Dados Iniciais de Teste no Supabase'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onRefreshData}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Atualizar do Supabase</span>
          </button>
        </div>
      </section>

      {/* Section Switcher: Aprovações & Pedidos vs Financeiro & Repasses */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-4">
        <button
          type="button"
          onClick={() => setAdminTab('operacao')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            adminTab === 'operacao'
              ? 'bg-zinc-900 text-white'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Aprovações e Pedidos</span>
          {pendingProfiles.length > 0 && (
            <span className="rounded bg-amber-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
              {pendingProfiles.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('financeiro')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            adminTab === 'financeiro'
              ? 'bg-emerald-600 text-white'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
          }`}
        >
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Financeiro & Repasses</span>
          {financialSummary.pendingCount > 0 && (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                adminTab === 'financeiro'
                  ? 'bg-white text-emerald-700'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {financialSummary.pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('avaliacoes')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            adminTab === 'avaliacoes'
              ? 'bg-amber-500 text-white'
              : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
          }`}
        >
          <Star className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Avaliações (Estrelas)</span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              adminTab === 'avaliacoes'
                ? 'bg-white text-amber-800'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {ratings.length}
          </span>
        </button>
      </div>

      {/* Admin KPI Strip */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
          <p className="text-xs font-medium text-amber-900">Aguardando Aprovação</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-800 tabular-nums">
            {pendingProfiles.length}
          </p>
          <p className="mt-1 text-xs text-amber-800/80">Fila de revisão manual</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-zinc-500">Condutores Aprovados</p>
          <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
            {approvedDriversCount}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <span
              className={`h-2 w-2 rounded-full ${
                onlineDriversCount > 0
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-zinc-400'
              }`}
              aria-hidden="true"
            />
            <span>{onlineDriversCount} ONLINE agora em POA</span>
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
          <p className="text-xs font-medium text-zinc-500">Pedidos em Porto Alegre</p>
          <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
            {orders.length}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {completedOrders.length} concluído(s)
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
          <p className="text-xs font-medium text-emerald-900">Bônus EV Revertido</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {formatBRL(totalEvIncentive)}
          </p>
          <p className="mt-1 text-xs text-emerald-800">Taxa zero para elétricos</p>
        </div>
      </section>

      {adminTab === 'avaliacoes' ? (
        <section className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-500">
                Total de Avaliações
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                {ratingsSummary.count}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Registradas na tabela ratings
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <p className="text-xs font-medium text-amber-900">
                Média Geral da Rede
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-800 tabular-nums">
                {ratingsSummary.count > 0
                  ? `★ ${ratingsSummary.avg.toFixed(1)}`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-amber-800/80">
                Escala de 1 a 5 estrelas
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <p className="text-xs font-medium text-emerald-900">
                Notas Máximas (5 ★)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                {ratingsSummary.fiveStarCount}
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                Excelência em entregas e coletas
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-zinc-900">
                Histórico de Avaliações Mútuas
              </h2>
              <p className="text-xs text-zinc-500">
                Notas trocadas entre Lojistas/PF e Entregadores após entregas concluídas.
              </p>
            </div>

            {ratings.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center space-y-2">
                <Star
                  className="mx-auto h-8 w-8 text-amber-500"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-zinc-900">
                  Nenhuma avaliação registrada ainda.
                </p>
                <p className="text-xs text-zinc-500">
                  Assim que pedidos forem concluídos e avaliados por lojistas ou
                  entregadores, as notas aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white overflow-hidden">
                {ratings.map((item) => {
                  const fromUser = profileById.get(item.fromProfileId);
                  const toUser = profileById.get(item.toProfileId);
                  const linkedOrder = orderById.get(item.deliveryId);

                  return (
                    <div
                      key={item.id}
                      className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-zinc-900">
                            {linkedOrder?.code || 'Pedido'}
                          </span>
                          <span className="text-zinc-400">·</span>
                          <span className="font-medium text-zinc-800">
                            {fromUser?.name || 'Usuário'}
                          </span>
                          <span className="text-zinc-400">avaliou</span>
                          <span className="font-semibold text-emerald-800">
                            {toUser?.name || 'Usuário'}
                          </span>
                          {toUser && (
                            <RatingBadge
                              avg={toUser.ratingAvg}
                              count={toUser.ratingCount}
                              compact
                            />
                          )}
                        </div>
                        {item.comment ? (
                          <p className="text-xs text-zinc-700 italic">
                            &ldquo;{item.comment}&rdquo;
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-400">
                            Sem comentário adicional
                          </p>
                        )}
                        <p className="text-[11px] font-mono text-zinc-400 tabular-nums">
                          {formatDateTimeBR(item.createdAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {[1, 2, 3, 4, 5].map((starVal) => (
                          <Star
                            key={starVal}
                            className={`h-4 w-4 ${
                              starVal <= item.stars
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-zinc-200'
                            }`}
                            aria-hidden="true"
                          />
                        ))}
                        <span className="ml-1 font-mono text-xs font-bold text-zinc-900">
                          {item.stars}/5
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : adminTab === 'financeiro' ? (
        <div className="space-y-6">
          {/* Chave Pix Oficial RotaJusta */}
          <form
            onSubmit={handleSaveOfficialPix}
            className="rounded-xl border border-emerald-200 bg-white p-5 space-y-4"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold text-zinc-900">
                  Chave Pix Oficial do RotaJusta
                </h2>
              </div>
              <span className="text-xs text-zinc-500">
                Exibida para lojistas que escolherem &ldquo;Pix para Plataforma RotaJusta&rdquo;
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">
              <div className="sm:col-span-3">
                <label
                  htmlFor="admin-pix-type"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  Tipo de Chave Pix
                </label>
                <select
                  id="admin-pix-type"
                  value={officialPixType}
                  onChange={(e) => setOfficialPixType(e.target.value as PixKeyType)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                >
                  {PIX_KEY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-6">
                <label
                  htmlFor="admin-pix-key"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  Chave Pix Oficial (salva no perfil Admin)
                </label>
                <input
                  id="admin-pix-key"
                  type="text"
                  value={officialPixInput}
                  onChange={(e) => setOfficialPixInput(e.target.value)}
                  placeholder={getPixKeyPlaceholder(officialPixType)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={isSavingOfficialPix}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSavingOfficialPix ? 'Salvando...' : 'Salvar Chave Pix Oficial'}
                </button>
              </div>
            </div>

            {officialPixMsg && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                {officialPixMsg}
              </p>
            )}
          </form>

          {/* Financial Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-500">
                Movimentado (Concluídas)
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-zinc-900 tabular-nums">
                {formatBRL(financialSummary.totalGross)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Taxa plataforma retida:{' '}
                <span className="font-mono font-medium text-zinc-800">
                  {formatBRL(financialSummary.totalPlatformFees)}
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <p className="text-xs font-medium text-amber-900">
                Pendentes de Repasse / Pix
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-amber-800 tabular-nums">
                {formatBRL(financialSummary.pendingRepasseAmount)}
              </p>
              <p className="mt-1 text-xs text-amber-800/80">
                {financialSummary.pendingCount} entrega(s) concluída(s) aguardando
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <p className="text-xs font-medium text-emerald-900">
                Repasses Concluídos
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
                {formatBRL(financialSummary.settledAmount)}
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                {financialSummary.settledCount} repasse(s) marcado(s) como pago(s)
              </p>
            </div>
          </div>

          {/* Completed Orders Repasses List */}
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-zinc-900">
                  Financeiro &amp; Repasses (Entregas Concluídas)
                </h2>
                <p className="text-xs text-zinc-500">
                  Copie a Chave Pix do entregador para efetuar o repasse e marque como
                  concluído no Supabase.
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 overflow-x-auto">
                {(
                  [
                    { value: 'Todos', label: 'Todos' },
                    { value: 'pendente_pagamento', label: 'Aguardando Pix' },
                    { value: 'pago_lojista', label: 'Pix Confirmado' },
                    { value: 'repassado', label: 'Repassado' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPaymentFilter(item.value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      paymentFilter === item.value
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCompletedOrders.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center space-y-2">
                <Wallet
                  className="mx-auto h-8 w-8 text-emerald-600"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-zinc-900">
                  Nenhuma entrega concluída para esse filtro financeiro.
                </p>
                <p className="text-xs text-zinc-500">
                  Assim que uma entrega for finalizada no Mural do Entregador, ela
                  aparecerá aqui para conciliação Pix.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCompletedOrders.map((order) => {
                  const courierProfile = order.assignedCourierId
                    ? profiles.find((p) => p.id === order.assignedCourierId)
                    : undefined;
                  const courierPix =
                    order.assignedCourierPixKey || courierProfile?.pixKey;
                  const netPayout = order.netCourierPayout ?? order.basePayout;
                  const fee =
                    order.appliedPlatformFee ?? order.standardPlatformFee;

                  return (
                    <article
                      key={order.id}
                      className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-zinc-900">
                            {order.code}
                          </span>
                          <span className="text-zinc-400">·</span>
                          <span className="font-medium text-zinc-800">
                            {order.pickupNeighborhood} →{' '}
                            {order.destinationNeighborhood}
                          </span>
                          <PaymentStatusBadge status={order.paymentStatus} compact />
                          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                            {formatPaymentMethodLabel(order.paymentMethod)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-600">
                          <span>
                            Entregador:{' '}
                            <strong className="text-zinc-900">
                              {order.assignedCourierName || 'Condutor'}
                            </strong>
                          </span>
                          {order.assignedCourierPropulsion && (
                            <PropulsionTag
                              propulsion={order.assignedCourierPropulsion}
                            />
                          )}
                          <span>
                            Total:{' '}
                            <strong className="font-mono text-zinc-900">
                              {formatBRL(order.grossTotal)}
                            </strong>
                          </span>
                          <span>
                            Repasse:{' '}
                            <strong className="font-mono text-emerald-700">
                              {formatBRL(netPayout)}
                            </strong>
                          </span>
                          <span>
                            Taxa app:{' '}
                            <strong className="font-mono text-zinc-900">
                              {formatBRL(fee)}
                            </strong>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-zinc-500">Chave Pix do condutor:</span>
                          {courierPix ? (
                            <>
                              <code className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono font-semibold text-zinc-900">
                                {courierPix}
                              </code>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopyCourierPix(order.id, courierPix)
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50"
                              >
                                {copiedPixId === order.id ? (
                                  <>
                                    <Check
                                      className="h-3 w-3 text-emerald-600"
                                      aria-hidden="true"
                                    />
                                    <span>Copiada</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" aria-hidden="true" />
                                    <span>Copiar Pix</span>
                                  </>
                                )}
                              </button>
                            </>
                          ) : (
                            <span className="text-amber-700 font-medium">
                              Não cadastrada
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {order.paymentStatus !== 'repassado' ? (
                          <button
                            type="button"
                            disabled={processingRepasseId === order.id}
                            onClick={() => void handleRepasseClick(order.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {processingRepasseId === order.id
                                ? 'Atualizando...'
                                : 'Marcar Repasse Concluído'}
                            </span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Repasse Finalizado</span>
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : (
        <>

      {/* Approval Queue & All Profiles */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-zinc-900">
              Gestão de Cadastros e Aprovações
            </h2>
            <p className="text-xs text-zinc-500">
              Entregadores aprovados ficam imediatamente disponíveis no Mural do Entregador.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 overflow-x-auto">
            {(
              [
                'Aguardando Aprovação',
                'Aprovado',
                'Bloqueado',
                'Todos',
              ] as const
            ).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filteredProfiles.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center space-y-2">
            <ShieldCheck
              className="mx-auto h-8 w-8 text-emerald-600"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-zinc-900">
              Nenhum perfil com o status &ldquo;{statusFilter}&rdquo;.
            </p>
            <p className="text-xs text-zinc-500">
              Novos cadastros feitos na aba &ldquo;Cadastro e Perfis&rdquo; aparecerão
              aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredProfiles.map((profile) => (
              <article
                key={profile.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-display text-base font-semibold text-zinc-900">
                      {profile.businessName || profile.name}
                    </h3>
                    <RatingBadge
                      avg={profile.ratingAvg}
                      count={profile.ratingCount}
                    />
                    {profile.personType && (
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                          profile.personType === 'PJ'
                            ? 'border-sky-200 bg-sky-50 text-sky-800'
                            : 'border-zinc-200 bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {profile.personType}
                      </span>
                    )}
                    <ApprovalStatusBadge status={profile.approvalStatus} />
                    {(profile.role === 'entregador' ||
                      profile.role === 'motorista') &&
                      profile.approvalStatus === 'Aprovado' && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                            profile.isOnline
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-zinc-200 bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              profile.isOnline ? 'bg-emerald-500' : 'bg-zinc-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{profile.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                        </span>
                      )}
                    {profile.propulsion && (
                      <PropulsionTag propulsion={profile.propulsion} />
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
                    <p>
                      <span className="text-zinc-400">Perfil:</span>{' '}
                      <strong className="font-medium text-zinc-800">
                        {roleLabel(profile)}
                      </strong>
                    </p>
                    <p>
                      <span className="text-zinc-400">Responsável:</span>{' '}
                      <span className="text-zinc-800">{profile.name}</span>
                    </p>
                    <p>
                      <span className="text-zinc-400">
                        {profile.personType === 'PJ' ? 'CNPJ (PJ):' : 'CPF (PF):'}
                      </span>{' '}
                      <span className="font-mono text-zinc-800 tabular-nums">
                        {formatCpfOrCnpj(
                          profile.documentNumber || profile.document,
                          profile.personType
                        ) || 'Não informado'}
                      </span>
                    </p>
                    {profile.personType === 'PJ' && profile.companyLegalName && (
                      <p>
                        <span className="text-zinc-400">Razão Social:</span>{' '}
                        <span className="text-zinc-800">
                          {profile.companyLegalName}
                        </span>
                      </p>
                    )}
                    <p>
                      <span className="text-zinc-400">Telefone:</span>{' '}
                      <span className="font-mono text-zinc-800">{profile.phone}</span>
                    </p>
                    <p>
                      <span className="text-zinc-400">Bairro POA:</span>{' '}
                      <span className="text-zinc-800">{profile.neighborhood}</span>
                    </p>
                    <p>
                      <span className="text-zinc-400">Cadastro:</span>{' '}
                      <span className="font-mono text-zinc-800 tabular-nums">
                        {formatDateTimeBR(profile.createdAt)}
                      </span>
                    </p>

                    {profile.vehicleType && (
                      <p>
                        <span className="text-zinc-400">Veículo:</span>{' '}
                        <span className="text-zinc-800">
                          {profile.vehicleType}
                          {profile.vehicleModel ? ` — ${profile.vehicleModel}` : ''}
                        </span>
                      </p>
                    )}

                    {profile.plate && (
                      <p>
                        <span className="text-zinc-400">Placa:</span>{' '}
                        <span className="font-mono text-zinc-800">{profile.plate}</span>
                      </p>
                    )}

                    {(profile.cnhNumber || profile.hasEar !== undefined) && (
                      <p>
                        <span className="text-zinc-400">CNH / EAR:</span>{' '}
                        <span className="font-mono text-zinc-800">
                          {profile.cnhNumber || 'Não informada'}
                        </span>{' '}
                        ·{' '}
                        <span
                          className={
                            profile.hasEar
                              ? 'font-semibold text-emerald-700'
                              : 'text-zinc-600'
                          }
                        >
                          {profile.hasEar ? 'EAR Confirmado' : 'Sem EAR'}
                        </span>
                      </p>
                    )}

                    {profile.pixKey && (
                      <p>
                        <span className="text-zinc-400">Chave Pix:</span>{' '}
                        <span className="font-mono text-zinc-800">
                          {profile.pixKey}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {/* One-click Approval / Block + Edit & Delete Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {profile.approvalStatus !== 'Aprovado' && (
                    <button
                      type="button"
                      onClick={() => onUpdateApproval(profile.id, 'Aprovado')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Aprovar</span>
                    </button>
                  )}
                  {profile.approvalStatus !== 'Bloqueado' && (
                    <button
                      type="button"
                      onClick={() => onUpdateApproval(profile.id, 'Bloqueado')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 whitespace-nowrap"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Bloquear</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditModal(profile)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap"
                  >
                    <Pencil className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
                    <span>Editar</span>
                  </button>
                  {profile.id === currentAdminId ? (
                    <span
                      title="Não é possível excluir o próprio usuário Admin logado"
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-[11px] font-medium text-zinc-400 whitespace-nowrap cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Protegido</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingProfile(profile);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Excluir</span>
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Demo & Active Orders Overview in Porto Alegre */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-zinc-900">
            Pedidos de Demonstração e Operação em Porto Alegre
          </h2>
          <p className="text-xs text-zinc-500">
            Cenário pronto para testes: Centro Histórico → Menino Deus (Rápida) e Moinhos
            de Vento → Cidade Baixa (Rota Consolidada).
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Modalidade</th>
                <th className="px-4 py-3 font-semibold">Trajeto (POA)</th>
                <th className="px-4 py-3 font-semibold">Entregador</th>
                <th className="px-4 py-3 font-semibold text-right">Valor Total</th>
                <th className="px-4 py-3 font-semibold text-right">Taxa / Bônus EV</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-zinc-50/70">
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-900 whitespace-nowrap">
                    {order.code}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">
                    {order.type === 'rapida'
                      ? `Rápida (${order.distanceKm?.toLocaleString('pt-BR')} km)`
                      : order.type === 'frete'
                      ? `Frete Utilitário (${order.distanceKm?.toLocaleString('pt-BR')} km)`
                      : `Rota (${order.packageCount} pct)`}
                  </td>
                  <td className="px-4 py-3 text-zinc-800">
                    {order.pickupNeighborhood} → {order.destinationNeighborhood}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {order.assignedCourierName ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span>{order.assignedCourierName}</span>
                        <RatingBadge
                          avg={order.assignedCourierRatingAvg}
                          count={order.assignedCourierRatingCount}
                          compact
                        />
                        <PropulsionTag propulsion={order.assignedCourierPropulsion} />
                      </span>
                    ) : (
                      <span className="text-zinc-400">Aguardando aceite</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-zinc-900 tabular-nums whitespace-nowrap">
                    {formatBRL(order.grossTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {isZeroFeePropulsion(order.assignedCourierPropulsion) ? (
                      <span className="text-emerald-700 font-medium">
                        Taxa R$ 0,00 · +{formatBRL(order.evBonusApplied ?? 0)}
                      </span>
                    ) : (
                      <span className="text-zinc-600">
                        Taxa {formatBRL(order.standardPlatformFee)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <OrderStatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

      {/* Modal de Edição Completa de Usuário (Admin) */}
      {editingProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-edit-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 overflow-y-auto"
          onClick={() => !isSavingEdit && setEditingProfile(null)}
        >
          <div
            className="my-auto w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 bg-zinc-50/70">
              <div>
                <h2
                  id="admin-edit-user-title"
                  className="font-display text-base font-bold text-zinc-900"
                >
                  Editar Cadastro no Supabase
                </h2>
                <p className="text-xs text-zinc-500">
                  Alterações aplicadas diretamente na tabela profiles.
                </p>
              </div>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => setEditingProfile(null)}
                aria-label="Fechar modal"
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form
              onSubmit={handleEditSubmit}
              className="p-5 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Nome / Loja
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Telefone / Usuário de Login
                  </label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Chave Pix
                  </label>
                  <input
                    type="text"
                    value={editPixKey}
                    onChange={(e) => setEditPixKey(e.target.value)}
                    placeholder="CPF, telefone, e-mail ou aleatória"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Perfil (role)
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="lojista">lojista (Solicitante / Loja)</option>
                    <option value="entregador">entregador</option>
                    <option value="motorista">motorista</option>
                    <option value="admin">admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Status de Acesso
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as ApprovalStatus)
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="Aprovado">aprovado</option>
                    <option value="Aguardando Aprovação">pendente</option>
                    <option value="Bloqueado">bloqueado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Tipo de Pessoa
                  </label>
                  <select
                    value={editPersonType}
                    onChange={(e) => {
                      const next = e.target.value as PersonType;
                      setEditPersonType(next);
                      setEditDocument(
                        next === 'PJ'
                          ? formatCnpjMask(editDocument)
                          : formatCpfMask(editDocument)
                      );
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="PF">PF (Pessoa Física)</option>
                    <option value="PJ">PJ (Pessoa Jurídica)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    {editPersonType === 'PJ' ? 'CNPJ' : 'CPF'} (document_number)
                  </label>
                  <input
                    type="text"
                    value={editDocument}
                    onChange={(e) =>
                      setEditDocument(
                        editPersonType === 'PJ'
                          ? formatCnpjMask(e.target.value)
                          : formatCpfMask(e.target.value)
                      )
                    }
                    placeholder={
                      editPersonType === 'PJ'
                        ? '00.000.000/0001-00'
                        : '000.000.000-00'
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                {editPersonType === 'PJ' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Razão Social (PJ)
                    </label>
                    <input
                      type="text"
                      value={editCompanyLegalName}
                      onChange={(e) => setEditCompanyLegalName(e.target.value)}
                      placeholder="Razão social da empresa"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Novo PIN de Acesso (4 dígitos — deixe em branco para manter o atual)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={editAccessPin}
                    onChange={(e) =>
                      setEditAccessPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="•••• (opcional)"
                    className="w-full sm:w-56 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {(editRole === 'entregador' || editRole === 'motorista') && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-800">
                    Dados do Veículo e Propulsão
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Categoria do Veículo
                      </label>
                      <select
                        value={editVehicleType}
                        onChange={(e) =>
                          handleEditVehicleChange(e.target.value as VehicleType)
                        }
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
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Propulsão
                      </label>
                      <select
                        value={editPropulsion}
                        onChange={(e) =>
                          setEditPropulsion(e.target.value as PropulsionType)
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                      >
                        {getPropulsionOptionsForVehicle(editVehicleType).map(
                          (p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {editVehicleType === 'Bike' && (
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1">
                          Raio máximo (Bike)
                        </label>
                        <select
                          value={
                            editBikeRadiusKm === null
                              ? 'unlimited'
                              : String(editBikeRadiusKm)
                          }
                          onChange={(e) =>
                            setEditBikeRadiusKm(
                              e.target.value === 'unlimited'
                                ? null
                                : Number(e.target.value)
                            )
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                        >
                          {BIKE_RADIUS_OPTIONS.map((opt) => (
                            <option
                              key={opt.shortLabel}
                              value={
                                opt.value === null
                                  ? 'unlimited'
                                  : String(opt.value)
                              }
                            >
                              {opt.fullLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-zinc-800 pt-2">
                      <input
                        type="checkbox"
                        checked={editHasEar}
                        onChange={(e) => setEditHasEar(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span>CNH com EAR confirmado</span>
                    </label>
                  </div>
                </div>
              )}

              {editError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {editError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-3">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingProfile(null)}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Usuário */}
      {deletingProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-delete-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4"
          onClick={() => !isDeleting && setDeletingProfile(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h2
                id="admin-delete-user-title"
                className="font-display text-base font-bold text-zinc-900"
              >
                Tem certeza que deseja excluir este usuário permanentemente?
              </h2>
              <p className="text-xs text-zinc-600">
                Usuário:{' '}
                <strong className="text-zinc-900">
                  {deletingProfile.businessName || deletingProfile.name}
                </strong>{' '}
                ({roleLabel(deletingProfile)}). Essa ação remove o cadastro da
                tabela <code className="font-mono">profiles</code> no Supabase.
              </p>
            </div>

            {deleteError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {deleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingProfile(null)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {isDeleting ? 'Excluindo...' : 'Excluir Permanentemente'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
