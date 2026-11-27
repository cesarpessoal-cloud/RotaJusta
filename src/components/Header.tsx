import { LogOut, Route, Send, Shield, ShieldCheck, Store, UserCog } from 'lucide-react';
import { Profile } from '../types';
import { PropulsionTag } from './EvBadge';
import { PWAInstallButton } from './PWAInstallButton';

export type AdminSupervisionView = 'admin' | 'lojista' | 'entregador';
export type MerchantWorkspaceTab = 'entregas' | 'vitrine';

interface HeaderProps {
  currentUser: Profile;
  adminView: AdminSupervisionView;
  onSelectAdminView: (view: AdminSupervisionView) => void;
  merchantTab?: MerchantWorkspaceTab;
  onSelectMerchantTab?: (tab: MerchantWorkspaceTab) => void;
  activeStoreProductsCount?: number;
  pendingApprovalsCount: number;
  onOpenAccount: () => void;
  onLogout: () => void;
}

const ADMIN_TABS: { id: AdminSupervisionView; label: string }[] = [
  { id: 'admin', label: 'Admin (Aprovações)' },
  { id: 'lojista', label: 'Supervisão: Lojista' },
  { id: 'entregador', label: 'Supervisão: Entregador' },
];

export function Header({
  currentUser,
  adminView,
  onSelectAdminView,
  merchantTab = 'entregas',
  onSelectMerchantTab,
  activeStoreProductsCount = 0,
  pendingApprovalsCount,
  onOpenAccount,
  onLogout,
}: HeaderProps) {
  const isAdmin = currentUser.role === 'admin';
  const isMerchant = currentUser.role === 'lojista';

  const roleSummary =
    currentUser.role === 'admin'
      ? 'Administrador · Porto Alegre'
      : currentUser.role === 'lojista'
      ? currentUser.personType === 'PF'
        ? 'Pessoa Física · Solicitações'
        : 'Empresa / Lojista'
      : `${currentUser.vehicleType || 'Entregador'}`;

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Route className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <span className="font-display text-xl font-bold tracking-tight text-zinc-900">
              RotaJusta
            </span>
            <span className="hidden sm:inline ml-2 text-xs text-zinc-400">
              Porto Alegre · RS
            </span>
          </div>
        </div>

        {/* Zone 2A: Merchant Top Menu Navigation */}
        {isMerchant && onSelectMerchantTab && (
          <nav
            aria-label="Menu principal da loja"
            className="hidden md:flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => onSelectMerchantTab('entregas')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                merchantTab === 'entregas'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Solicitar Entregas</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectMerchantTab('vitrine')}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                merchantTab === 'vitrine'
                  ? 'border-emerald-700 bg-emerald-600 text-white shadow-xs'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
              }`}
            >
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Minha Vitrine / Catálogo de Produtos</span>
              {activeStoreProductsCount > 0 && (
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                    merchantTab === 'vitrine'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-200/80 text-emerald-950'
                  }`}
                >
                  {activeStoreProductsCount}
                </span>
              )}
            </button>
          </nav>
        )}

        {/* Zone 2B: Supervision Tabs ONLY for Admin */}
        {isAdmin && (
          <nav
            aria-label="Supervisão Admin"
            className="hidden md:flex items-center gap-6"
          >
            {ADMIN_TABS.map((tab) => {
              const isActive = adminView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectAdminView(tab.id)}
                  className={`relative py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 ${
                    isActive
                      ? 'text-emerald-700 font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'admin' && pendingApprovalsCount > 0 && (
                    <span className="ml-1.5 font-mono text-xs tabular-nums text-emerald-700">
                      ({pendingApprovalsCount})
                    </span>
                  )}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-emerald-600"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Zone 3: Logged-in User Info + Minha Conta / Segurança + Sair */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:block text-right">
            <div className="flex items-center justify-end gap-1.5">
              {isAdmin && (
                <Shield
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                  aria-hidden="true"
                />
              )}
              {currentUser.twoFactorEnabled && (
                <ShieldCheck
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                  aria-label="2FA ativo"
                />
              )}
              <p className="text-xs sm:text-sm font-semibold text-zinc-900 leading-tight max-w-[160px] sm:max-w-[200px] truncate">
                {currentUser.name}
              </p>
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className="text-[11px] text-zinc-500">{roleSummary}</span>
              {currentUser.propulsion && (
                <span className="hidden lg:inline-flex">
                  <PropulsionTag propulsion={currentUser.propulsion} />
                </span>
              )}
            </div>
          </div>

          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onOpenAccount}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
          >
            <UserCog className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
            <span className="hidden xs:inline sm:inline">Minha Conta / Segurança</span>
            <span className="sm:hidden">Conta</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation bar for Merchant */}
      {isMerchant && onSelectMerchantTab && (
        <nav
          aria-label="Menu principal móvel da loja"
          className="flex md:hidden items-center gap-2 overflow-x-auto border-t border-zinc-100 px-4 py-2"
        >
          <button
            type="button"
            onClick={() => onSelectMerchantTab('entregas')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              merchantTab === 'entregas'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Solicitar Entregas</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectMerchantTab('vitrine')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              merchantTab === 'vitrine'
                ? 'border-emerald-700 bg-emerald-600 text-white'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
            }`}
          >
            <Store className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Minha Vitrine / Catálogo</span>
            {activeStoreProductsCount > 0 && (
              <span className="font-mono text-[11px] font-bold">
                ({activeStoreProductsCount})
              </span>
            )}
          </button>
        </nav>
      )}

      {/* Mobile supervision bar ONLY for Admin */}
      {isAdmin && (
        <nav
          aria-label="Supervisão Admin móvel"
          className="flex md:hidden items-center gap-1 overflow-x-auto border-t border-zinc-100 px-4 py-2"
        >
          {ADMIN_TABS.map((tab) => {
            const isActive = adminView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectAdminView(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                {tab.label}
                {tab.id === 'admin' && pendingApprovalsCount > 0
                  ? ` (${pendingApprovalsCount})`
                  : ''}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
