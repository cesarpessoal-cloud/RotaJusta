import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bike,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  KeyRound,
  Loader2,
  LogIn,
  Phone,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  Store,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  insertProfileInSupabase,
  loginWithPhoneAndPin,
  verifyLoginTwoFactor,
} from '../lib/supabaseService';
import {
  PersonType,
  PixKeyType,
  Profile,
  PropulsionType,
  VehicleType,
} from '../types';
import {
  formatCnpjMask,
  formatCpfMask,
  isValidCnpj,
  isValidCpf,
  lookupCnpjBrasilApi,
  onlyDigits,
} from '../utils/documentValidation';
import { getPixKeyPlaceholder, PIX_KEY_TYPES } from '../utils/pix';
import { isZeroFeePropulsion } from '../utils/pricing';
import {
  BIKE_RADIUS_OPTIONS,
  getVehicleCompatibilityLabel,
  VEHICLE_CATEGORIES,
} from '../utils/vehicleCompatibility';

interface AuthScreenProps {
  onLoginSuccess: (profile: Profile) => void;
  isDatabaseEmpty: boolean;
  isCheckingEmpty: boolean;
  isSeeding: boolean;
  dbError: string | null;
  onSeedTestData: () => Promise<void>;
  onRetryConnection: () => Promise<void>;
}

type AuthTab = 'entrar' | 'cadastrar';
type RegProfileChoice = 'pf_solicitante' | 'pj_lojista' | 'pf_entregador';

export function AuthScreen({
  onLoginSuccess,
  isDatabaseEmpty,
  isCheckingEmpty,
  isSeeding,
  dbError,
  onSeedTestData,
  onRetryConnection,
}: AuthScreenProps) {
  const [authTab, setAuthTab] = useState<AuthTab>('entrar');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Pending / Blocked / 2FA challenge state
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  const [blockedProfile, setBlockedProfile] = useState<Profile | null>(null);
  const [twoFactorProfile, setTwoFactorProfile] = useState<Profile | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);

  // Registration form state
  const [regChoice, setRegChoice] = useState<RegProfileChoice>('pf_solicitante');
  const [regDocument, setRegDocument] = useState('');
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [isLookingUpCnpj, setIsLookingUpCnpj] = useState(false);
  const [cnpjLookupStatus, setCnpjLookupStatus] = useState<{
    cnpj: string;
    isActive: boolean;
    statusText: string;
    message?: string;
  } | null>(null);
  const lastLookedUpCnpjRef = useRef<string>('');

  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('Moto');
  const [propulsion, setPropulsion] = useState<PropulsionType>('Elétrico');
  const [bikeMaxRadiusKm, setBikeMaxRadiusKm] = useState<number | null>(3);
  const [hasEar, setHasEar] = useState<boolean>(false);
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('Telefone');
  const [pixKey, setPixKey] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState('');

  const regRole: 'lojista' | 'entregador' =
    regChoice === 'pf_entregador' ? 'entregador' : 'lojista';
  const regPersonType: PersonType =
    regChoice === 'pj_lojista' ? 'PJ' : 'PF';

  const handleVehicleTypeChange = (nextVehicle: VehicleType) => {
    setVehicleType(nextVehicle);
    if (nextVehicle === 'Bike') {
      setPropulsion((prev) =>
        prev === 'Combustão' || prev === 'Propulsão Humana (Convencional)'
          ? 'Propulsão Humana (Convencional)'
          : 'Elétrica / Pedal Assistido (E-Bike)'
      );
    } else {
      setPropulsion((prev) =>
        prev === 'Combustão' || prev === 'Propulsão Humana (Convencional)'
          ? 'Combustão'
          : 'Elétrico'
      );
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setPendingProfile(null);
    setBlockedProfile(null);

    if (!loginIdentifier.trim()) {
      setLoginError('Informe seu telefone cadastrado ou o usuário admin.');
      return;
    }
    if (!/^\d{4}$/.test(loginPin.trim())) {
      setLoginError('Digite o PIN de 4 dígitos numéricos.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const profile = await loginWithPhoneAndPin(loginIdentifier, loginPin);
      if (!profile) {
        setLoginError('Telefone/usuário ou PIN de 4 dígitos incorreto.');
        return;
      }

      if (profile.approvalStatus === 'Aguardando Aprovação') {
        setPendingProfile(profile);
        return;
      }

      if (profile.approvalStatus === 'Bloqueado') {
        setBlockedProfile(profile);
        return;
      }

      if (profile.twoFactorEnabled) {
        setTwoFactorProfile(profile);
        setTwoFactorCode('');
        setTwoFactorError('');
        return;
      }

      onLoginSuccess(profile);
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'Erro ao consultar o Supabase.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRecheckPending = async () => {
    if (!pendingProfile) return;
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const refreshed = await loginWithPhoneAndPin(
        loginIdentifier.trim() || pendingProfile.phone,
        loginPin.trim() || regPin.trim()
      );
      if (!refreshed) {
        setPendingProfile(null);
        setAuthTab('entrar');
        return;
      }
      if (refreshed.approvalStatus === 'Aprovado') {
        if (refreshed.twoFactorEnabled) {
          setPendingProfile(null);
          setTwoFactorProfile(refreshed);
          setTwoFactorCode('');
          setTwoFactorError('');
          return;
        }
        onLoginSuccess(refreshed);
        return;
      }
      if (refreshed.approvalStatus === 'Bloqueado') {
        setPendingProfile(null);
        setBlockedProfile(refreshed);
        return;
      }
      setPendingProfile(refreshed);
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'Erro ao verificar status.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorProfile) return;
    setTwoFactorError('');

    if (!/^\d{6}$/.test(twoFactorCode.trim())) {
      setTwoFactorError('Digite o código de 6 dígitos do aplicativo autenticador.');
      return;
    }

    setIsVerifying2FA(true);
    try {
      const ok = await verifyLoginTwoFactor(
        twoFactorProfile.id,
        twoFactorCode.trim()
      );
      if (!ok) {
        setTwoFactorError('Código de 6 dígitos inválido ou expirado.');
        return;
      }
      const verifiedProfile = twoFactorProfile;
      setTwoFactorProfile(null);
      setTwoFactorCode('');
      onLoginSuccess(verifiedProfile);
    } catch (err) {
      setTwoFactorError(
        err instanceof Error
          ? err.message
          : 'Erro ao validar código 2FA no Supabase.'
      );
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleSelectRegChoice = (choice: RegProfileChoice) => {
    const prevWasPj = regChoice === 'pj_lojista';
    const nextIsPj = choice === 'pj_lojista';
    setRegChoice(choice);
    setRegError('');
    if (prevWasPj !== nextIsPj) {
      setRegDocument('');
      setCompanyLegalName('');
      setCnpjLookupStatus(null);
      lastLookedUpCnpjRef.current = '';
    }
  };

  const handleDocumentChange = (raw: string) => {
    setRegError('');
    if (regPersonType === 'PJ') {
      const masked = formatCnpjMask(raw);
      setRegDocument(masked);
      const digits = onlyDigits(masked);
      if (digits !== cnpjLookupStatus?.cnpj) {
        setCnpjLookupStatus(null);
        setCompanyLegalName('');
      }
      if (digits.length < 14) {
        lastLookedUpCnpjRef.current = '';
      }
    } else {
      setRegDocument(formatCpfMask(raw));
    }
  };

  const runCnpjLookup = async (rawCnpj: string) => {
    const digits = onlyDigits(rawCnpj);
    if (!isValidCnpj(digits)) {
      setCnpjLookupStatus({
        cnpj: digits,
        isActive: false,
        statusText: 'INVÁLIDO',
        message: 'CNPJ matematicamente inválido. Confira os 14 dígitos.',
      });
      return null;
    }

    lastLookedUpCnpjRef.current = digits;
    setIsLookingUpCnpj(true);
    setRegError('');
    try {
      const result = await lookupCnpjBrasilApi(digits);
      setCnpjLookupStatus({
        cnpj: digits,
        isActive: result.isActive,
        statusText: result.statusText,
        message: result.errorMessage,
      });
      if (result.isActive && result.companyLegalName) {
        setCompanyLegalName(result.companyLegalName);
        if (!regName.trim()) {
          setRegName(result.tradeName || result.companyLegalName);
        }
      }
      return result;
    } finally {
      setIsLookingUpCnpj(false);
    }
  };

  useEffect(() => {
    if (regPersonType !== 'PJ') return;
    const digits = onlyDigits(regDocument);
    if (
      digits.length === 14 &&
      isValidCnpj(digits) &&
      lastLookedUpCnpjRef.current !== digits &&
      !isLookingUpCnpj
    ) {
      void runCnpjLookup(digits);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regDocument, regPersonType]);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setPendingProfile(null);
    setBlockedProfile(null);

    const docDigits = onlyDigits(regDocument);

    if (regPersonType === 'PJ') {
      if (!isValidCnpj(docDigits)) {
        setRegError(
          'CNPJ inválido. Verifique os dígitos informados (não são aceitos números repetidos ou dígitos verificadores incorretos).'
        );
        return;
      }

      let verifiedLegalName = companyLegalName.trim();

      // Garante validação na Receita via BrasilAPI se ainda não consultado ou inativo
      if (
        !cnpjLookupStatus ||
        cnpjLookupStatus.cnpj !== docDigits ||
        !cnpjLookupStatus.isActive
      ) {
        const lookup = await runCnpjLookup(docDigits);
        if (lookup && !lookup.isActive) {
          setRegError(
            lookup.errorMessage ||
              'Este CNPJ não está com situação ATIVA na Receita Federal.'
          );
          return;
        }
        if (lookup?.isActive && lookup.companyLegalName) {
          verifiedLegalName = lookup.companyLegalName;
        }
      }

      const finalDisplayName =
        regName.trim() || verifiedLegalName || 'Empresa Parceira';
      if (!finalDisplayName || !regPhone.trim()) {
        setRegError('Preencha o nome da empresa/responsável e o telefone.');
        return;
      }

      if (!/^\d{4}$/.test(regPin.trim())) {
        setRegError('Crie um PIN numérico com exatamente 4 dígitos.');
        return;
      }

      setIsRegistering(true);
      try {
        const created = await insertProfileInSupabase({
          role: 'lojista',
          personType: 'PJ',
          name: finalDisplayName,
          companyLegalName: verifiedLegalName || finalDisplayName,
          phone: regPhone.trim(),
          document: regDocument,
          documentNumber: docDigits,
          neighborhood: 'Porto Alegre',
          hasEar: false,
          accessPin: regPin.trim(),
          approvalStatus: 'Aprovado',
        });
        onLoginSuccess(created);
      } catch (err) {
        setRegError(
          err instanceof Error
            ? err.message
            : 'Erro ao criar conta no Supabase.'
        );
      } finally {
        setIsRegistering(false);
      }
      return;
    }

    // Pessoa Física (Solicitante PF ou Entregador PF) -> exige CPF válido
    if (!isValidCpf(docDigits)) {
      setRegError(
        'CPF inválido. Verifique os 11 dígitos (não são aceitos números repetidos ou dígitos verificadores incorretos).'
      );
      return;
    }

    if (!regName.trim() || !regPhone.trim()) {
      setRegError('Preencha seu nome completo e telefone.');
      return;
    }

    if (!/^\d{4}$/.test(regPin.trim())) {
      setRegError('Crie um PIN numérico com exatamente 4 dígitos.');
      return;
    }

    setIsRegistering(true);
    try {
      const created = await insertProfileInSupabase({
        role: regRole,
        personType: 'PF',
        name: regName.trim(),
        phone: regPhone.trim(),
        document: regDocument,
        documentNumber: docDigits,
        neighborhood: 'Porto Alegre',
        vehicleType: regRole === 'entregador' ? vehicleType : undefined,
        propulsion: regRole === 'entregador' ? propulsion : undefined,
        bikeMaxRadiusKm:
          regRole === 'entregador' && vehicleType === 'Bike'
            ? bikeMaxRadiusKm
            : undefined,
        hasEar: regRole === 'entregador' ? hasEar : false,
        pixKey: regRole === 'entregador' ? pixKey.trim() || undefined : undefined,
        accessPin: regPin.trim(),
        approvalStatus:
          regRole === 'lojista' ? 'Aprovado' : 'Aguardando Aprovação',
      });

      if (regRole === 'lojista') {
        onLoginSuccess(created);
      } else {
        setLoginIdentifier(created.phone);
        setLoginPin(regPin.trim());
        setPendingProfile(created);
      }
    } catch (err) {
      setRegError(
        err instanceof Error ? err.message : 'Erro ao criar conta no Supabase.'
      );
    } finally {
      setIsRegistering(false);
    }
  };

  // Step 2: 2FA Authenticator Challenge View
  if (twoFactorProfile) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-7 space-y-5 shadow-xs">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
              <KeyRound className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold text-emerald-700">
              Verificação em Duas Etapas (2FA)
            </p>
            <h1 className="font-display text-xl font-bold text-zinc-900">
              Olá, {twoFactorProfile.name}
            </h1>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Digite o código de 6 dígitos exibido no seu aplicativo autenticador
              para concluir o acesso ao RotaJusta.
            </p>
          </div>

          <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-2fa-code"
                className="block text-xs font-semibold text-zinc-700 mb-1.5"
              >
                Código de 6 dígitos do Autenticador
              </label>
              <input
                id="login-2fa-code"
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={twoFactorCode}
                onChange={(e) =>
                  setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="000000"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center font-mono text-lg font-semibold tracking-[0.35em] text-zinc-900 placeholder:text-zinc-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            {twoFactorError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {twoFactorError}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={isVerifying2FA}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {isVerifying2FA ? 'Validando...' : 'Confirmar e Entrar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFactorProfile(null);
                  setTwoFactorCode('');
                  setTwoFactorError('');
                }}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Voltar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Friendly Pending Analysis View
  if (pendingProfile) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-7 space-y-5 shadow-xs text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
            <Clock className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-emerald-700">
              RotaJusta · Porto Alegre (RS)
            </p>
            <h1 className="font-display text-xl font-bold text-zinc-900">
              Cadastro em Análise
            </h1>
            <p className="text-sm text-zinc-700 leading-relaxed">
              Seu cadastro está em análise pela equipe RotaJusta de Porto Alegre.
              Assim que aprovado, seu mural será liberado.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-left text-xs text-zinc-600 space-y-1">
            <p>
              <span className="text-zinc-400">Nome:</span>{' '}
              <strong className="text-zinc-900">{pendingProfile.name}</strong>
            </p>
            <p>
              <span className="text-zinc-400">Telefone:</span>{' '}
              <span className="font-mono text-zinc-800">{pendingProfile.phone}</span>
            </p>
            {pendingProfile.vehicleType && (
              <p>
                <span className="text-zinc-400">Veículo:</span>{' '}
                <span className="text-zinc-800">
                  {pendingProfile.vehicleType} ({pendingProfile.propulsion})
                </span>
              </p>
            )}
          </div>

          {loginError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {loginError}
            </p>
          )}

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              disabled={isLoggingIn}
              onClick={() => void handleRecheckPending()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {isLoggingIn ? 'Verificando...' : 'Verificar Aprovação'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingProfile(null);
                setAuthTab('entrar');
              }}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Voltar para Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Friendly Blocked Account View
  if (blockedProfile) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-red-200 bg-white p-7 space-y-5 shadow-xs text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 border border-red-200 text-red-600">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-zinc-900">
              Acesso Suspenso
            </h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              O perfil de <strong>{blockedProfile.name}</strong> encontra-se bloqueado
              pela moderação. Entre em contato com a equipe RotaJusta de Porto Alegre.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBlockedProfile(null);
              setAuthTab('entrar');
            }}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Voltar para Entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-between px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg space-y-6 my-auto">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
            <Route className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            RotaJusta
          </h1>
          <p className="text-sm text-zinc-600">
            Entregas urbanas, rotas e pequenos fretes com taxa fixa justa em{' '}
            <strong className="font-semibold text-zinc-800">Porto Alegre · RS</strong>
          </p>
        </div>

        {dbError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="h-4 w-4 text-red-600 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{dbError}</span>
            </div>
            <button
              type="button"
              onClick={() => void onRetryConnection()}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-800 hover:bg-red-100 shrink-0"
            >
              Tentar
            </button>
          </div>
        )}

        {/* Main Auth Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7 space-y-6 shadow-xs">
          {/* Two Tabs: Entrar / Cadastrar-se */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthTab('entrar');
                setRegError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                authTab === 'entrar'
                  ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <LogIn className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <span>Entrar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthTab('cadastrar');
                setLoginError('');
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                authTab === 'cadastrar'
                  ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <UserPlus className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <span>Cadastrar-se</span>
            </button>
          </div>

          {authTab === 'entrar' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  Telefone (ou usuário <span className="font-mono">admin</span>)
                </label>
                <div className="relative">
                  <Phone
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-identifier"
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="(51) 99999-0000 ou admin"
                    className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-pin"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  PIN de 4 dígitos
                </label>
                <div className="relative">
                  <KeyRound
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    id="login-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={loginPin}
                    onChange={(e) =>
                      setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="••••"
                    className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 py-2.5 font-mono text-sm tracking-[0.35em] text-zinc-900 placeholder:tracking-normal placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {loginError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>{isLoggingIn ? 'Entrando...' : 'Entrar no RotaJusta'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <span className="block text-xs font-semibold text-zinc-700 mb-2">
                  Como você deseja usar o RotaJusta?
                </span>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectRegChoice('pf_solicitante')}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      regChoice === 'pf_solicitante'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <User
                      className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-semibold">
                        Pessoa Física (Quero enviar pacotes ou pedir frete)
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Exige CPF válido · Acesso imediato para solicitar entregas e
                        fretes
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectRegChoice('pj_lojista')}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      regChoice === 'pj_lojista'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <Store
                      className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-semibold">
                        Empresa / Lojista (Quero despachar vendas)
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Exige CNPJ ativo na Receita Federal · Acesso imediato ao painel
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectRegChoice('pf_entregador')}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      regChoice === 'pf_entregador'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <Bike
                      className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-semibold">
                        Entregador / Motorista (Quero fazer entregas)
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Exige CPF válido · Mural liberado após aprovação Admin
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* CPF / CNPJ Validation + BrasilAPI Lookup */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-2.5">
                <label
                  htmlFor="reg-auth-document"
                  className="block text-xs font-semibold text-zinc-800"
                >
                  {regPersonType === 'PJ'
                    ? 'CNPJ da Empresa (Obrigatório)'
                    : 'CPF (Obrigatório)'}
                </label>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="reg-auth-document"
                    type="text"
                    inputMode="numeric"
                    value={regDocument}
                    onChange={(e) => handleDocumentChange(e.target.value)}
                    placeholder={
                      regPersonType === 'PJ'
                        ? '00.000.000/0001-00'
                        : '000.000.000-00'
                    }
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />

                  {regPersonType === 'PJ' && (
                    <button
                      type="button"
                      disabled={
                        isLookingUpCnpj || onlyDigits(regDocument).length !== 14
                      }
                      onClick={() => void runCnpjLookup(regDocument)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {isLookingUpCnpj ? (
                        <>
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                          <span>Consultando...</span>
                        </>
                      ) : (
                        <>
                          <Search className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Consultar CNPJ</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Inline Real-Time Validation Feedback */}
                {regPersonType === 'PF' &&
                  onlyDigits(regDocument).length === 11 &&
                  !isValidCpf(regDocument) && (
                    <p className="text-xs font-medium text-red-700">
                      CPF matematicamente inválido. Confira os 11 dígitos.
                    </p>
                  )}
                {regPersonType === 'PF' &&
                  onlyDigits(regDocument).length === 11 &&
                  isValidCpf(regDocument) && (
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>CPF válido (Módulo 11 verificado)</span>
                    </p>
                  )}

                {regPersonType === 'PJ' &&
                  onlyDigits(regDocument).length === 14 &&
                  !isValidCnpj(regDocument) && (
                    <p className="text-xs font-medium text-red-700">
                      CNPJ matematicamente inválido. Confira os 14 dígitos.
                    </p>
                  )}

                {regPersonType === 'PJ' && cnpjLookupStatus && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      cnpjLookupStatus.isActive
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    {cnpjLookupStatus.isActive ? (
                      <div className="space-y-0.5">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Building2
                            className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                            aria-hidden="true"
                          />
                          <span>Situação Cadastral: ATIVA</span>
                        </p>
                        {companyLegalName && (
                          <p className="text-[11px] text-emerald-800">
                            Razão Social: <strong>{companyLegalName}</strong>
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="font-medium">
                        {cnpjLookupStatus.message ||
                          `Situação Cadastral: ${cnpjLookupStatus.statusText}`}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="reg-auth-name"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  {regChoice === 'pj_lojista'
                    ? 'Nome Fantasia / Loja'
                    : 'Nome Completo'}
                </label>
                <input
                  id="reg-auth-name"
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder={
                    regChoice === 'pj_lojista'
                      ? 'Ex: Café & Livraria do Centro (preenchido pelo CNPJ)'
                      : regChoice === 'pf_solicitante'
                      ? 'Ex: Mariana Costa'
                      : 'Ex: João Carlos Silveira'
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="reg-auth-phone"
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    WhatsApp / Telefone
                  </label>
                  <input
                    id="reg-auth-phone"
                    type="text"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="(51) 99999-0000"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-auth-pin"
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    PIN de Acesso (4 dígitos)
                  </label>
                  <input
                    id="reg-auth-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={regPin}
                    onChange={(e) =>
                      setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="Ex: 1234"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tracking-[0.3em] text-zinc-900 placeholder:tracking-normal placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {regRole === 'entregador' && (
                <div className="space-y-3.5 border-t border-zinc-200 pt-3.5">
                  <div>
                    <span className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Tipo de Veículo
                    </span>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {VEHICLE_CATEGORIES.map((vt) => (
                        <button
                          key={vt}
                          type="button"
                          onClick={() => handleVehicleTypeChange(vt)}
                          className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                            vehicleType === vt
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          {vt}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Serviços compatíveis:{' '}
                      <strong className="text-zinc-700">
                        {getVehicleCompatibilityLabel(vehicleType)}
                      </strong>
                    </p>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Propulsão
                    </span>
                    {vehicleType === 'Bike' ? (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPropulsion('Propulsão Humana (Convencional)')
                          }
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                            propulsion === 'Propulsão Humana (Convencional)'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          <Bike
                            className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                            aria-hidden="true"
                          />
                          <span>Propulsão Humana (Convencional)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPropulsion('Elétrica / Pedal Assistido (E-Bike)')
                          }
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                            propulsion === 'Elétrica / Pedal Assistido (E-Bike)'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          <Zap
                            className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                            aria-hidden="true"
                          />
                          <span>Elétrica / Pedal Assistido (E-Bike)</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPropulsion('Elétrico')}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                            propulsion === 'Elétrico'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          <Zap
                            className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                            aria-hidden="true"
                          />
                          <span>Elétrico</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPropulsion('Combustão')}
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                            propulsion === 'Combustão'
                              ? 'border-zinc-900 bg-zinc-100 text-zinc-900 font-semibold'
                              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          Combustão
                        </button>
                      </div>
                    )}
                  </div>

                  {vehicleType === 'Bike' && (
                    <div>
                      <span className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Raio máximo por entrega (km)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                        {BIKE_RADIUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.shortLabel}
                            type="button"
                            onClick={() => setBikeMaxRadiusKm(opt.value)}
                            className={`rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                              bikeMaxRadiusKm === opt.value
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                                : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            {opt.shortLabel}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isZeroFeePropulsion(propulsion) && (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      <CheckCircle2
                        className="inline h-3.5 w-3.5 mr-1 text-emerald-600"
                        aria-hidden="true"
                      />
                      {propulsion === 'Propulsão Humana (Convencional)'
                        ? 'Selo Bike · Taxa Zero: plataforma R$ 0,00.'
                        : propulsion === 'Elétrica / Pedal Assistido (E-Bike)'
                        ? 'Selo E-Bike · Bônus EV: taxa R$ 0,00 revertida ao ciclista.'
                        : 'Selo Elétrico · Bônus EV: taxa R$ 0,00 revertida ao condutor.'}
                    </p>
                  )}

                  <label className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 cursor-pointer text-xs text-zinc-800">
                    <input
                      type="checkbox"
                      checked={hasEar}
                      onChange={(e) => setHasEar(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>
                      Possuo CNH com observação <strong>EAR</strong>
                    </span>
                  </label>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-2.5">
                    <div>
                      <span className="block text-xs font-semibold text-zinc-800">
                        Chave Pix para Recebimentos
                      </span>
                      <p className="text-[11px] text-zinc-500">
                        Usada para receber pagamentos diretos dos lojistas e repasses do
                        RotaJusta.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="reg-pix-type"
                          className="block text-[11px] font-medium text-zinc-600 mb-1"
                        >
                          Tipo de Chave Pix
                        </label>
                        <select
                          id="reg-pix-type"
                          value={pixKeyType}
                          onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                        >
                          {PIX_KEY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label
                          htmlFor="reg-pix-key"
                          className="block text-[11px] font-medium text-zinc-600 mb-1"
                        >
                          Chave Pix
                        </label>
                        <input
                          id="reg-pix-key"
                          type="text"
                          value={pixKey}
                          onChange={(e) => setPixKey(e.target.value)}
                          placeholder={getPixKeyPlaceholder(pixKeyType)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {regError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {regError}
                </p>
              )}

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>
                  {isRegistering
                    ? 'Criando conta...'
                    : regRole === 'lojista'
                    ? 'Criar Conta e Entrar'
                    : 'Enviar Cadastro para Análise'}
                </span>
              </button>
            </form>
          )}
        </div>

        {/* Discreet Seed Option ONLY when Supabase database is completely empty */}
        {!isCheckingEmpty && isDatabaseEmpty && !dbError && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-950 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Banco Supabase vazio. Popule perfis de teste (Admin + Moto Elétrica +
              Utilitário) e 2 pedidos em POA.
            </span>
            <button
              type="button"
              disabled={isSeeding}
              onClick={() => void onSeedTestData()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {isSeeding
                  ? 'Carregando...'
                  : 'Carregar Dados Iniciais de Teste no Supabase'}
              </span>
            </button>
          </div>
        )}
      </div>

      <footer className="text-center text-xs text-zinc-500 pt-6">
        RotaJusta · Mobilidade limpa e taxa fixa justa em Porto Alegre (RS)
      </footer>
    </div>
  );
}
