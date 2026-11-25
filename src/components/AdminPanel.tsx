import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Database,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  ApprovalStatus,
  Order,
  PaymentStatus,
  PixKeyType,
  Profile,
} from '../types';
import {
  formatPaymentMethodLabel,
  getPixKeyPlaceholder,
  inferPixKeyType,
  PIX_KEY_TYPES,
} from '../utils/pix';
import { formatCpfOrCnpj } from '../utils/documentValidation';
import { formatBRL, formatDateTimeBR, isZeroFeePropulsion } from '../utils/pricing';
import {
  ApprovalStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PropulsionTag,
} from './EvBadge';

interface AdminPanelProps {
  profiles: Profile[];
  orders: Order[];
  platformPixKey: string | null;
  isDatabaseEmpty: boolean;
  isSeeding: boolean;
  onUpdateApproval: (profileId: string, status: ApprovalStatus) => Promise<void>;
  onRefreshData: () => Promise<void>;
  onSeedTestData: () => Promise<void>;
  onUpdatePlatformPixKey: (pixKey: string) => Promise<void>;
  onMarkRepasseDone: (orderId: string) => Promise<void>;
}

type AdminSectionTab = 'operacao' | 'financeiro';

export function AdminPanel({
  profiles,
  orders,
  platformPixKey,
  isDatabaseEmpty,
  isSeeding,
  onUpdateApproval,
  onRefreshData,
  onSeedTestData,
  onUpdatePlatformPixKey,
  onMarkRepasseDone,
}: AdminPanelProps) {
  const [adminTab, setAdminTab] = useState<AdminSectionTab>('operacao');
  const [statusFilter, setStatusFilter] = useState<'Todos' | ApprovalStatus>(
    'Aguardando Aprovação'
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
          <p className="mt-1 text-xs text-zinc-500">Habilitados para operar</p>
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

      {adminTab === 'financeiro' ? (
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

                {/* One-click Approval / Block Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {profile.approvalStatus !== 'Aprovado' && (
                    <button
                      type="button"
                      onClick={() => onUpdateApproval(profile.id, 'Aprovado')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Aprovar</span>
                    </button>
                  )}
                  {profile.approvalStatus !== 'Bloqueado' && (
                    <button
                      type="button"
                      onClick={() => onUpdateApproval(profile.id, 'Bloqueado')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Bloquear</span>
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
                      <span className="inline-flex items-center gap-1.5">
                        <span>{order.assignedCourierName}</span>
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
    </div>
  );
}
