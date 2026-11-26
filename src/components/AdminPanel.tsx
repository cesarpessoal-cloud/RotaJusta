import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Eye,
  Mail,
  MailCheck,
  Pencil,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Store,
  Trash2,
  User,
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
  formatPlateInput,
  formatVehicleModelAndColor,
  isValidBrazilianPlate,
} from '../utils/courierIdentity';
import { compressImageToJpeg } from '../utils/imageCompression';
import {
  formatCnpjMask,
  formatCpfMask,
  formatCpfOrCnpj,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from '../utils/documentValidation';
import {
  exportAuthorizedEmailsCsv,
  isValidEmail,
} from '../utils/emailValidation';
import {
  formatPickupCode,
  normalizeCodeSearchQuery,
} from '../utils/pickupCode';
import { formatBRL, formatDateTimeBR, isZeroFeePropulsion } from '../utils/pricing';
import {
  BIKE_RADIUS_OPTIONS,
  getPropulsionOptionsForVehicle,
  VEHICLE_CATEGORIES,
} from '../utils/vehicleCompatibility';
import { CourierAvatar, VehiclePlateBadge } from './CourierAvatar';
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
type AdminProfileTypeFilter = 'Todos' | 'PF' | 'PJ' | 'Entregador';

function getProfileCategory(
  profile: Profile
): 'pf' | 'pj' | 'entregador' | 'admin' {
  if (profile.role === 'admin') return 'admin';
  if (profile.role === 'entregador' || profile.role === 'motorista') {
    return 'entregador';
  }
  const docDigits = onlyDigits(profile.documentNumber || profile.document || '');
  if (
    profile.personType === 'PF' ||
    (!profile.personType && docDigits.length === 11)
  ) {
    return 'pf';
  }
  return 'pj';
}

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
  const [profileTypeFilter, setProfileTypeFilter] =
    useState<AdminProfileTypeFilter>('Todos');
  const [profileSearch, setProfileSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
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
  const [editAcceptsMarketing, setEditAcceptsMarketing] = useState(false);
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
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editVehicleModel, setEditVehicleModel] = useState('');
  const [editVehicleColor, setEditVehicleColor] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [isCompressingEditAvatar, setIsCompressingEditAvatar] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // CSV Export feedback state
  const [exportCsvFeedback, setExportCsvFeedback] = useState<{
    type: 'ok' | 'info';
    text: string;
  } | null>(null);

  // View Details Modal state
  const [viewingProfile, setViewingProfile] = useState<Profile | null>(null);

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

  const profileCategoryCounts = useMemo(() => {
    let pf = 0;
    let pj = 0;
    let entregador = 0;
    for (const p of profiles) {
      const cat = getProfileCategory(p);
      if (cat === 'pf') pf += 1;
      else if (cat === 'pj') pj += 1;
      else if (cat === 'entregador') entregador += 1;
    }
    return {
      all: profiles.length,
      pf,
      pj,
      entregador,
    };
  }, [profiles]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let blocked = 0;
    for (const p of profiles) {
      if (p.approvalStatus === 'Aguardando Aprovação') pending += 1;
      else if (p.approvalStatus === 'Aprovado') approved += 1;
      else if (p.approvalStatus === 'Bloqueado') blocked += 1;
    }
    return { all: profiles.length, pending, approved, blocked };
  }, [profiles]);

  const marketingOptInCount = useMemo(
    () =>
      profiles.filter(
        (p) => Boolean(p.acceptsMarketing) && Boolean(p.email && p.email.trim())
      ).length,
    [profiles]
  );

  const handleExportAuthorizedEmails = () => {
    const result = exportAuthorizedEmailsCsv(profiles);
    if (result.count === 0) {
      setExportCsvFeedback({
        type: 'info',
        text: 'Nenhum usuário com e-mail cadastrado optou por receber comunicações até o momento.',
      });
    } else {
      setExportCsvFeedback({
        type: 'ok',
        text: `Lista exportada com ${result.count} ${
          result.count === 1 ? 'e-mail autorizado' : 'e-mails autorizados'
        } (${result.filename}).`,
      });
    }
  };

  const filteredProfiles = useMemo(() => {
    const query = profileSearch.trim().toLowerCase();
    const queryDigits = onlyDigits(profileSearch);

    return profiles.filter((p) => {
      if (statusFilter !== 'Todos' && p.approvalStatus !== statusFilter) {
        return false;
      }

      if (profileTypeFilter !== 'Todos') {
        const cat = getProfileCategory(p);
        if (profileTypeFilter === 'PF' && cat !== 'pf') return false;
        if (profileTypeFilter === 'PJ' && cat !== 'pj') return false;
        if (profileTypeFilter === 'Entregador' && cat !== 'entregador') {
          return false;
        }
      }

      if (query) {
        const docDigits = onlyDigits(p.documentNumber || p.document || '');
        const phoneDigits = onlyDigits(p.phone || '');
        const matchesText =
          p.name.toLowerCase().includes(query) ||
          (p.businessName || '').toLowerCase().includes(query) ||
          (p.companyLegalName || '').toLowerCase().includes(query) ||
          (p.email || '').toLowerCase().includes(query) ||
          p.phone.toLowerCase().includes(query);
        const matchesDigits =
          queryDigits.length > 0 &&
          (docDigits.includes(queryDigits) || phoneDigits.includes(queryDigits));
        if (!matchesText && !matchesDigits) {
          return false;
        }
      }

      return true;
    });
  }, [profiles, statusFilter, profileTypeFilter, profileSearch]);

  const filteredAdminOrders = useMemo(() => {
    const raw = orderSearch.trim().toLowerCase();
    if (!raw) return orders;
    const normalizedCode = normalizeCodeSearchQuery(orderSearch);
    return orders.filter((order) => {
      if (
        order.code.toLowerCase().includes(raw) ||
        normalizeCodeSearchQuery(order.code).includes(normalizedCode)
      ) {
        return true;
      }
      if (
        order.stops.some((s) => {
          const pkgCode = s.pickupCode || formatPickupCode(s.id);
          return (
            pkgCode.toLowerCase().includes(raw) ||
            normalizeCodeSearchQuery(pkgCode).includes(normalizedCode)
          );
        })
      ) {
        return true;
      }
      return (
        order.merchantName.toLowerCase().includes(raw) ||
        order.pickupNeighborhood.toLowerCase().includes(raw) ||
        order.destinationNeighborhood.toLowerCase().includes(raw) ||
        (order.assignedCourierName || '').toLowerCase().includes(raw)
      );
    });
  }, [orders, orderSearch]);

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
    setEditAcceptsMarketing(Boolean(profile.acceptsMarketing));
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
    setEditAvatarUrl(profile.avatarUrl || '');
    setEditVehicleModel(profile.vehicleModel || '');
    setEditVehicleColor(profile.vehicleColor || '');
    setEditPlate(profile.plate || '');
    setEditError(null);
  };

  const handleEditVehicleChange = (nextVehicle: VehicleType) => {
    setEditVehicleType(nextVehicle);
    const allowed = getPropulsionOptionsForVehicle(nextVehicle);
    if (!allowed.includes(editPropulsion)) {
      setEditPropulsion(allowed[0]);
    }
    if (nextVehicle === 'Bike') {
      if (editBikeRadiusKm === undefined) {
        setEditBikeRadiusKm(3);
      }
      setEditPlate('');
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

    const docDigits = onlyDigits(editDocument);
    if (docDigits.length > 0) {
      if (editPersonType === 'PF' && !isValidCpf(docDigits)) {
        setEditError('CPF inválido. Confira os 11 dígitos ou deixe em branco.');
        return;
      }
      if (editPersonType === 'PJ' && !isValidCnpj(docDigits)) {
        setEditError('CNPJ inválido. Confira os 14 dígitos ou deixe em branco.');
        return;
      }
    }

    if (editEmail.trim() && !isValidEmail(editEmail)) {
      setEditError('Informe um e-mail válido (ex.: nome@dominio.com) ou deixe em branco.');
      return;
    }

    if (editAccessPin.trim() && !/^\d{4}$/.test(editAccessPin.trim())) {
      setEditError('O novo PIN deve conter exatamente 4 dígitos numéricos.');
      return;
    }

    const isDriverRole = editRole === 'entregador' || editRole === 'motorista';
    if (
      isDriverRole &&
      editVehicleType !== 'Bike' &&
      editPlate.trim() &&
      !isValidBrazilianPlate(editPlate)
    ) {
      setEditError('Informe uma placa válida (ex.: ABC1D23 ou ABC1234) ou deixe em branco.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await onEditProfile({
        profileId: editingProfile.id,
        name: editName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        acceptsMarketing: editAcceptsMarketing,
        role: editRole,
        personType: editPersonType,
        documentNumber: editDocument,
        companyLegalName: editCompanyLegalName.trim(),
        approvalStatus: editStatus,
        accessPin: editAccessPin.trim() || undefined,
        pixKey: editPixKey.trim(),
        vehicleType: isDriverRole ? editVehicleType : null,
        propulsion: isDriverRole ? editPropulsion : null,
        bikeMaxRadiusKm:
          isDriverRole && editVehicleType === 'Bike'
            ? editBikeRadiusKm
            : null,
        hasEar: isDriverRole ? editHasEar : false,
        avatarUrl: isDriverRole ? editAvatarUrl.trim() || null : null,
        vehicleModel: isDriverRole ? editVehicleModel.trim() || null : null,
        vehicleColor: isDriverRole ? editVehicleColor.trim() || null : null,
        plate:
          isDriverRole && editVehicleType !== 'Bike'
            ? editPlate.trim().toUpperCase() || null
            : null,
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
    const cat = getProfileCategory(profile);
    if (cat === 'admin') return 'Administrador';
    if (cat === 'pf') return 'Pessoa Física (PF) · Entregas / Frete';
    if (cat === 'pj') return 'Lojista / Empresa (PJ)';
    if (profile.role === 'motorista') {
      return 'Motorista / Entregador (PF)';
    }
    return 'Entregador / Motorista (PF)';
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
            Admin (Gestão &amp; Aprovações)
          </h1>
          <p className="text-sm text-zinc-600 max-w-2xl">
            Gerencie usuários Pessoa Física (PF), Lojistas (PJ) e Entregadores /
            Motoristas com todos os dados de CPF/CNPJ, veículo e aprovações.
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-zinc-900">
              Gestão de Usuários e Aprovações
            </h2>
            <p className="text-xs text-zinc-500">
              Visualize, filtre, edite ou exclua cadastros de Pessoa Física (PF),
              Lojistas (PJ) e Entregadores / Motoristas.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleExportAuthorizedEmails}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Exportar Lista de E-mails Autorizados (CSV)</span>
              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700 border border-emerald-200">
                {marketingOptInCount}
              </span>
            </button>

            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail, CPF, CNPJ ou telefone..."
                className="w-full rounded-lg border border-zinc-300 bg-white pl-8 pr-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {exportCsvFeedback && (
          <div
            className={`flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium ${
              exportCsvFeedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <span>{exportCsvFeedback.text}</span>
            <button
              type="button"
              onClick={() => setExportCsvFeedback(null)}
              aria-label="Fechar aviso de exportação"
              className="rounded p-0.5 hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Dedicated Profile Type Filter + Status Filter */}
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 overflow-x-auto">
            {(
              [
                {
                  value: 'Todos',
                  label: `Todos (${profileCategoryCounts.all})`,
                },
                {
                  value: 'PF',
                  label: `Pessoa Física (PF) (${profileCategoryCounts.pf})`,
                },
                {
                  value: 'PJ',
                  label: `Lojistas / PJ (${profileCategoryCounts.pj})`,
                },
                {
                  value: 'Entregador',
                  label: `Entregadores / Motoristas (${profileCategoryCounts.entregador})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setProfileTypeFilter(tab.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  profileTypeFilter === tab.value
                    ? 'bg-zinc-900 text-white shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 overflow-x-auto">
            {(
              [
                { value: 'Todos', label: `Todos (${statusCounts.all})` },
                {
                  value: 'Aguardando Aprovação',
                  label: `Pendentes (${statusCounts.pending})`,
                },
                {
                  value: 'Aprovado',
                  label: `Aprovados (${statusCounts.approved})`,
                },
                {
                  value: 'Bloqueado',
                  label: `Bloqueados (${statusCounts.blocked})`,
                },
              ] as const
            ).map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setStatusFilter(st.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st.value
                    ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {st.label}
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
              Nenhum usuário encontrado para os filtros selecionados.
            </p>
            <p className="text-xs text-zinc-500">
              Ajuste o filtro de tipo de perfil, status ou busca para visualizar
              outros cadastros.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredProfiles.map((profile) => {
              const category = getProfileCategory(profile);
              const isPj = category === 'pj';
              const isPfSolicitante = category === 'pf';
              const isDriver = category === 'entregador';

              return (
              <article
                key={profile.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {isDriver && (
                      <CourierAvatar
                        name={profile.name}
                        avatarUrl={profile.avatarUrl}
                        size="md"
                      />
                    )}
                    <h3 className="font-display text-base font-semibold text-zinc-900">
                      {profile.businessName || profile.name}
                    </h3>
                    <RatingBadge
                      avg={profile.ratingAvg}
                      count={profile.ratingCount}
                    />
                    {isPfSolicitante && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800">
                        <User className="h-3 w-3" aria-hidden="true" />
                        <span>Pessoa Física (PF)</span>
                      </span>
                    )}
                    {isPj && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
                        <Store className="h-3 w-3" aria-hidden="true" />
                        <span>Lojista / Empresa (PJ)</span>
                      </span>
                    )}
                    {isDriver && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <span>Entregador / Motorista (PF)</span>
                      </span>
                    )}
                    {category === 'admin' && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-900 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                        <span>Admin</span>
                      </span>
                    )}
                    <ApprovalStatusBadge status={profile.approvalStatus} />
                    {isDriver &&
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
                    {profile.acceptsMarketing ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <MailCheck className="h-3 w-3" aria-hidden="true" />
                        <span>Recebe e-mails</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        <span>Não optou</span>
                      </span>
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
                        {isPj ? 'CNPJ (PJ):' : 'CPF (PF):'}
                      </span>{' '}
                      <span className="font-mono text-zinc-800 tabular-nums">
                        {formatCpfOrCnpj(
                          profile.documentNumber || profile.document,
                          isPj ? 'PJ' : 'PF'
                        ) || 'Não informado'}
                      </span>
                    </p>
                    {isPj && profile.companyLegalName && (
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
                      <span className="text-zinc-400">E-mail:</span>{' '}
                      <span className="text-zinc-800">
                        {profile.email || 'Não informado'}
                      </span>
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
                          {formatVehicleModelAndColor(
                            profile.vehicleModel,
                            profile.vehicleColor
                          )
                            ? ` — ${formatVehicleModelAndColor(
                                profile.vehicleModel,
                                profile.vehicleColor
                              )}`
                            : ''}
                        </span>
                      </p>
                    )}

                    {isDriver && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-400">Placa:</span>
                        {profile.vehicleType === 'Bike' ? (
                          <span className="text-zinc-800 font-medium">
                            Bicicleta (não exigida)
                          </span>
                        ) : (
                          <VehiclePlateBadge plate={profile.plate} compact />
                        )}
                      </div>
                    )}

                    {isDriver && (
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

                {/* View Details + Approval / Block + Edit & Delete Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewingProfile(profile)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                    <span>Detalhes</span>
                  </button>
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
                  {profile.approvalStatus !== 'Bloqueado' &&
                    profile.id !== currentAdminId && (
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
              );
            })}
          </div>
        )}
      </section>

      {/* Demo & Active Orders Overview in Porto Alegre */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-zinc-900">
              Pedidos e Corridas em Porto Alegre
            </h2>
            <p className="text-xs text-zinc-500">
              Acompanhe todas as corridas pelo código único #RS-XXXX, trajeto,
              entregador e repasse.
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Buscar por código #RS-XXXX, bairro ou nome..."
              aria-label="Buscar corridas por código #RS-XXXX, bairro ou usuário"
              className="w-full rounded-lg border border-zinc-300 bg-white pl-8 pr-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
            />
          </div>
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
              {filteredAdminOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-xs text-zinc-500"
                  >
                    Nenhuma corrida encontrada para &ldquo;{orderSearch}&rdquo;.
                  </td>
                </tr>
              ) : (
                filteredAdminOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono font-bold text-zinc-950">
                        {order.code}
                      </span>
                      {order.type === 'rota' && order.stops.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {order.stops.map((st) => (
                            <span
                              key={st.id}
                              className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[10px] text-zinc-600"
                            >
                              {st.pickupCode || formatPickupCode(st.id)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">
                      {order.type === 'rapida'
                        ? `Rápida (${order.distanceKm?.toLocaleString('pt-BR')} km)`
                        : order.type === 'frete'
                        ? `Frete Utilitário (${order.distanceKm?.toLocaleString('pt-BR')} km)`
                        : `Rota (${order.packageCount} pct)`}
                    </td>
                    <td className="px-4 py-3 text-zinc-800">
                      <span className="font-medium">{order.merchantName}</span>
                      <span className="block text-[11px] text-zinc-500">
                        {order.pickupNeighborhood} → {order.destinationNeighborhood}
                      </span>
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
                ))
              )}
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
                    <option value="lojista">
                      lojista (Pessoa Física PF ou Lojista PJ)
                    </option>
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

                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 cursor-pointer text-xs text-zinc-800">
                    <input
                      type="checkbox"
                      checked={editAcceptsMarketing}
                      onChange={(e) => setEditAcceptsMarketing(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>
                      Optou por receber novidades e dicas operacionais por e-mail (LGPD)
                    </span>
                  </label>
                </div>
              </div>

              {(editRole === 'entregador' || editRole === 'motorista') && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-800">
                    Foto de Segurança, Veículo, Placa e Propulsão
                  </p>

                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3">
                    <CourierAvatar
                      name={editName || editingProfile.name}
                      avatarUrl={editAvatarUrl || undefined}
                      size="md"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                        <Camera
                          className="h-3.5 w-3.5 text-emerald-600"
                          aria-hidden="true"
                        />
                        <span>
                          {isCompressingEditAvatar
                            ? 'Processando...'
                            : editAvatarUrl
                            ? 'Trocar Foto'
                            : 'Enviar Foto'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={isCompressingEditAvatar}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            setIsCompressingEditAvatar(true);
                            try {
                              const dataUrl = await compressImageToJpeg(
                                file,
                                280,
                                0.72
                              );
                              setEditAvatarUrl(dataUrl);
                            } finally {
                              setIsCompressingEditAvatar(false);
                            }
                          }}
                        />
                      </label>
                      {editAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setEditAvatarUrl('')}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>
                  </div>

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

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Modelo do Veículo
                      </label>
                      <input
                        type="text"
                        value={editVehicleModel}
                        onChange={(e) => setEditVehicleModel(e.target.value)}
                        placeholder="Ex: Honda CG 160"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Cor do Veículo
                      </label>
                      <input
                        type="text"
                        value={editVehicleColor}
                        onChange={(e) => setEditVehicleColor(e.target.value)}
                        placeholder="Ex: Preta"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Placa{' '}
                        {editVehicleType === 'Bike'
                          ? '(Não exigida para Bike)'
                          : '(Mercosul / Antiga)'}
                      </label>
                      <input
                        type="text"
                        value={editPlate}
                        disabled={editVehicleType === 'Bike'}
                        onChange={(e) =>
                          setEditPlate(formatPlateInput(e.target.value))
                        }
                        placeholder={
                          editVehicleType === 'Bike' ? 'Não exigida' : 'ABC1D23'
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs uppercase text-zinc-900 focus:border-emerald-600 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
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

                    <label className="flex items-center gap-2 text-xs text-zinc-800 pt-2 sm:col-span-2">
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

      {/* Modal de Visualização de Detalhes do Usuário */}
      {viewingProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-view-user-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 overflow-y-auto"
          onClick={() => setViewingProfile(null)}
        >
          <div
            className="my-auto w-full max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 bg-zinc-50/70">
              <div className="flex items-center gap-3">
                {(viewingProfile.role === 'entregador' ||
                  viewingProfile.role === 'motorista') && (
                  <CourierAvatar
                    name={viewingProfile.name}
                    avatarUrl={viewingProfile.avatarUrl}
                    size="md"
                  />
                )}
                <div className="space-y-0.5">
                  <h2
                    id="admin-view-user-title"
                    className="font-display text-base font-bold text-zinc-900"
                  >
                    {viewingProfile.businessName || viewingProfile.name}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {roleLabel(viewingProfile)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingProfile(null)}
                aria-label="Fechar detalhes"
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <ApprovalStatusBadge status={viewingProfile.approvalStatus} />
                <RatingBadge
                  avg={viewingProfile.ratingAvg}
                  count={viewingProfile.ratingCount}
                />
                {viewingProfile.twoFactorEnabled && (
                  <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                    2FA Ativo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-zinc-400">Nome / Responsável</p>
                  <p className="font-semibold text-zinc-900 mt-0.5">
                    {viewingProfile.name}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">
                    {getProfileCategory(viewingProfile) === 'pj'
                      ? 'CNPJ (Pessoa Jurídica)'
                      : 'CPF (Pessoa Física)'}
                  </p>
                  <p className="font-mono font-semibold text-zinc-900 mt-0.5 tabular-nums">
                    {formatCpfOrCnpj(
                      viewingProfile.documentNumber || viewingProfile.document,
                      getProfileCategory(viewingProfile) === 'pj' ? 'PJ' : 'PF'
                    ) || 'Não informado'}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Telefone / Login</p>
                  <p className="font-mono text-zinc-900 mt-0.5">
                    {viewingProfile.phone}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">E-mail & Consentimento</p>
                  <p className="text-zinc-900 mt-0.5 break-all">
                    {viewingProfile.email || 'Não informado'}
                  </p>
                  <p className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        viewingProfile.acceptsMarketing
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {viewingProfile.acceptsMarketing
                        ? 'Recebe e-mails'
                        : 'Não optou'}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Chave Pix</p>
                  <p className="font-mono text-zinc-900 mt-0.5">
                    {viewingProfile.pixKey || 'Não cadastrada'}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Data de Cadastro</p>
                  <p className="font-mono text-zinc-900 mt-0.5 tabular-nums">
                    {formatDateTimeBR(viewingProfile.createdAt)}
                  </p>
                </div>
                {viewingProfile.companyLegalName && (
                  <div className="sm:col-span-2">
                    <p className="text-zinc-400">Razão Social (PJ)</p>
                    <p className="text-zinc-900 mt-0.5">
                      {viewingProfile.companyLegalName}
                    </p>
                  </div>
                )}
                {viewingProfile.vehicleType && (
                  <div className="sm:col-span-2 space-y-1.5">
                    <p className="text-zinc-400">Veículo, Placa &amp; Propulsão</p>
                    <p className="text-zinc-900">
                      {viewingProfile.vehicleType} ·{' '}
                      {viewingProfile.propulsion || 'Padrão'}
                      {formatVehicleModelAndColor(
                        viewingProfile.vehicleModel,
                        viewingProfile.vehicleColor
                      )
                        ? ` · ${formatVehicleModelAndColor(
                            viewingProfile.vehicleModel,
                            viewingProfile.vehicleColor
                          )}`
                        : ''}
                      {viewingProfile.vehicleType === 'Bike'
                        ? ` · Raio: ${
                            viewingProfile.bikeMaxRadiusKm === null
                              ? 'Sem limite'
                              : `${viewingProfile.bikeMaxRadiusKm ?? 3} km`
                          }`
                        : ''}
                    </p>
                    {viewingProfile.vehicleType !== 'Bike' && (
                      <div>
                        <VehiclePlateBadge plate={viewingProfile.plate} compact />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingProfile;
                    setViewingProfile(null);
                    openEditModal(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Editar Cadastro</span>
                </button>
                {viewingProfile.id !== currentAdminId && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingProfile;
                      setViewingProfile(null);
                      setDeleteError(null);
                      setDeletingProfile(target);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Excluir</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingProfile(null)}
                  className="rounded-lg bg-zinc-900 px-4 py-2 font-semibold text-white hover:bg-zinc-800"
                >
                  Fechar
                </button>
              </div>
            </div>
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
