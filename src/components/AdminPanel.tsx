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
  formatVehicleModelAndColor,
  isValidBrazilianPlate,
} from '../utils/courierIdentity';
import { getFipeGroupForVehicleType } from '../utils/fipeApi';
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
import { formatBRL, formatDateTimeBR, hasCleanMobilityDiscount } from '../utils/pricing';
import {
  BIKE_RADIUS_OPTIONS,
  getPropulsionOptionsForVehicle,
  VEHICLE_CATEGORIES,
} from '../utils/vehicleCompatibility';
import { CourierAvatar, VehiclePlateBadge } from './CourierAvatar';
import { FipeVehicleFields } from './FipeVehicleFields';
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
  const safeProfiles = Array.isArray(profiles) ? profiles : [];
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeRatings = Array.isArray(ratings) ? ratings : [];

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
    () => safeProfiles.filter((p) => p.approvalStatus === 'Aguardando Aprovação'),
    [safeProfiles]
  );

  const approvedDriversCount = useMemo(
    () =>
      safeProfiles.filter(
        (p) =>
          (p.role === 'entregador' || p.role === 'motorista') &&
          p.approvalStatus === 'Aprovado'
      ).length,
    [safeProfiles]
  );

  const onlineDriversCount = useMemo(
    () =>
      safeProfiles.filter(
        (p) =>
          (p.role === 'entregador' || p.role === 'motorista') &&
          p.approvalStatus === 'Aprovado' &&
          Boolean(p.isOnline)
      ).length,
    [safeProfiles]
  );

  const totalEvIncentive = useMemo(
    () => safeOrders.reduce((acc, ord) => acc + (ord.evBonusApplied ?? 0), 0),
    [safeOrders]
  );

  const completedOrders = useMemo(
    () => safeOrders.filter((o) => o.status === 'Entregue'),
    [safeOrders]
  );

  const financialSummary = useMemo(() => {
    const totalGross = completedOrders.reduce((acc, o) => acc + (o.grossTotal ?? 0), 0);
    const pendingRepasseOrders = completedOrders.filter(
      (o) => o.paymentStatus !== 'repassado'
    );
    const pendingRepasseAmount = pendingRepasseOrders.reduce(
      (acc, o) => acc + (o.netCourierPayout ?? o.basePayout ?? 0),
      0
    );
    const settledOrders = completedOrders.filter(
      (o) => o.paymentStatus === 'repassado'
    );
    const settledAmount = settledOrders.reduce(
      (acc, o) => acc + (o.netCourierPayout ?? o.basePayout ?? 0),
      0
    );
    const totalPlatformFees = completedOrders.reduce(
      (acc, o) => acc + (o.appliedPlatformFee ?? o.standardPlatformFee ?? 0),
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
    for (const p of safeProfiles) {
      const cat = getProfileCategory(p);
      if (cat === 'pf') pf += 1;
      else if (cat === 'pj') pj += 1;
      else if (cat === 'entregador') entregador += 1;
    }
    return {
      all: safeProfiles.length,
      pf,
      pj,
      entregador,
    };
  }, [safeProfiles]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let blocked = 0;
    for (const p of safeProfiles) {
      if (p.approvalStatus === 'Aguardando Aprovação') pending += 1;
      else if (p.approvalStatus === 'Aprovado') approved += 1;
      else if (p.approvalStatus === 'Bloqueado') blocked += 1;
    }
    return { all: safeProfiles.length, pending, approved, blocked };
  }, [safeProfiles]);

  const marketingOptInCount = useMemo(
    () =>
      safeProfiles.filter(
        (p) => Boolean(p.acceptsMarketing) && Boolean(p.email && p.email.trim())
      ).length,
    [safeProfiles]
  );

  const handleExportAuthorizedEmails = () => {
    const result = exportAuthorizedEmailsCsv(safeProfiles);
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

    return safeProfiles.filter((p) => {
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
          (p.name || '').toLowerCase().includes(query) ||
          (p.businessName || '').toLowerCase().includes(query) ||
          (p.companyLegalName || '').toLowerCase().includes(query) ||
          (p.email || '').toLowerCase().includes(query) ||
          (p.phone || '').toLowerCase().includes(query);
        const matchesDigits =
          queryDigits.length > 0 &&
          (docDigits.includes(queryDigits) || phoneDigits.includes(queryDigits));
        if (!matchesText && !matchesDigits) {
          return false;
        }
      }

      return true;
    });
  }, [safeProfiles, statusFilter, profileTypeFilter, profileSearch]);

  const filteredAdminOrders = useMemo(() => {
    const raw = orderSearch.trim().toLowerCase();
    if (!raw) return safeOrders;
    const normalizedCode = normalizeCodeSearchQuery(orderSearch);
    return safeOrders.filter((order) => {
      if (
        (order.code || '').toLowerCase().includes(raw) ||
        normalizeCodeSearchQuery(order.code || '').includes(normalizedCode)
      ) {
        return true;
      }
      if (
        Array.isArray(order.stops) &&
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
        (order.merchantName || '').toLowerCase().includes(raw) ||
        (order.pickupNeighborhood || '').toLowerCase().includes(raw) ||
        (order.destinationNeighborhood || '').toLowerCase().includes(raw) ||
        (order.assignedCourierName || '').toLowerCase().includes(raw)
      );
    });
  }, [safeOrders, orderSearch]);

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
    const prevGroup = getFipeGroupForVehicleType(editVehicleType);
    const nextGroup = getFipeGroupForVehicleType(nextVehicle);
    setEditVehicleType(nextVehicle);
    if (prevGroup !== nextGroup) {
      setEditVehicleModel('');
    }
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
    () => new Map(safeProfiles.map((p) => [p.id, p] as const)),
    [safeProfiles]
  );

  const orderById = useMemo(
    () => new Map(safeOrders.map((o) => [o.id, o] as const)),
    [safeOrders]
  );

  const ratingsSummary = useMemo(() => {
    if (safeRatings.length === 0) {
      return { count: 0, avg: 0, fiveStarCount: 0 };
    }
    const sum = safeRatings.reduce((acc, r) => acc + (r.stars ?? 0), 0);
    const fiveStarCount = safeRatings.filter((r) => r.stars === 5).length;
    return {
      count: safeRatings.length,
      avg: Number((sum / safeRatings.length).toFixed(1)),
      fiveStarCount,
    };
  }, [safeRatings]);

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
