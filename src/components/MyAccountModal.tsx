import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bike,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  Mail,
  Phone,
  QrCode,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Truck,
  User,
  X,
} from 'lucide-react';
import {
  disableTwoFactorInSupabase,
  enableTwoFactorInSupabase,
  updateAccessPinInSupabase,
  updateBasicAccountInfoInSupabase,
  updateCourierIdentityInSupabase,
  updateLoginIdentifierInSupabase,
  updatePixKeyInSupabase,
} from '../lib/supabaseService';
import {
  PixKeyType,
  Profile,
  PropulsionType,
  VehicleType,
} from '../types';
import {
  formatPlateInput,
  isValidBrazilianPlate,
} from '../utils/courierIdentity';
import { formatCpfOrCnpj } from '../utils/documentValidation';
import { isValidEmail, normalizeEmail } from '../utils/emailValidation';
import { compressImageToJpeg } from '../utils/imageCompression';
import {
  getPixKeyPlaceholder,
  inferPixKeyType,
  PIX_KEY_TYPES,
} from '../utils/pix';
import { buildOtpAuthUri, generateBase32Secret } from '../utils/totp';
import {
  getPropulsionOptionsForVehicle,
  VEHICLE_CATEGORIES,
} from '../utils/vehicleCompatibility';
import { CourierAvatar } from './CourierAvatar';

interface MyAccountModalProps {
  currentUser: Profile;
  onClose: () => void;
  onProfileUpdated: (updated: Profile, message: string) => void;
}

export function MyAccountModal({
  currentUser,
  onClose,
  onProfileUpdated,
}: MyAccountModalProps) {
  // Basic Info State (Name + Email)
  const [nameInput, setNameInput] = useState(currentUser.name);
  const [emailInput, setEmailInput] = useState(currentUser.email || '');
  const [acceptsMarketingInput, setAcceptsMarketingInput] = useState(
    Boolean(currentUser.acceptsMarketing)
  );
  const [isSavingBasic, setIsSavingBasic] = useState(false);
  const [basicMsg, setBasicMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Courier Visual Identity & Vehicle State
  const isCourierProfile =
    currentUser.role === 'entregador' || currentUser.role === 'motorista';
  const [avatarUrlInput, setAvatarUrlInput] = useState(
    currentUser.avatarUrl || ''
  );
  const [isCompressingAvatar, setIsCompressingAvatar] = useState(false);
  const [vehicleTypeInput, setVehicleTypeInput] = useState<VehicleType>(
    currentUser.vehicleType || 'Moto'
  );
  const [propulsionInput, setPropulsionInput] = useState<PropulsionType>(
    currentUser.propulsion || 'Combustão'
  );
  const [vehicleModelInput, setVehicleModelInput] = useState(
    currentUser.vehicleModel || ''
  );
  const [vehicleColorInput, setVehicleColorInput] = useState(
    currentUser.vehicleColor || ''
  );
  const [plateInput, setPlateInput] = useState(currentUser.plate || '');
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [vehicleMsg, setVehicleMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Pix Key State (Entregador / Motorista / Admin)
  const canUsePixKey =
    currentUser.role === 'entregador' ||
    currentUser.role === 'motorista' ||
    currentUser.role === 'admin';
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>(() =>
    inferPixKeyType(currentUser.pixKey)
  );
  const [pixKeyInput, setPixKeyInput] = useState(currentUser.pixKey || '');
  const [isSavingPix, setIsSavingPix] = useState(false);
  const [pixMsg, setPixMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Sensitive: Login Identifier (Phone / admin)
  const [phoneInput, setPhoneInput] = useState(currentUser.phone);
  const [phonePin, setPhonePin] = useState('');
  const [phoneTotp, setPhoneTotp] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Sensitive: Access PIN Change
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [pinTotp, setPinTotp] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // 2FA Setup / Disable State
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [setupOtpCode, setSetupOtpCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [isSaving2FA, setIsSaving2FA] = useState(false);

  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disablePin, setDisablePin] = useState('');
  const [disableTotp, setDisableTotp] = useState('');
  const [twoFaMsg, setTwoFaMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const roleLabel =
    currentUser.role === 'admin'
      ? 'Administrador'
      : currentUser.role === 'lojista'
      ? currentUser.personType === 'PF'
        ? 'Solicitante (PF)'
        : 'Empresa / Lojista (PJ)'
      : currentUser.role === 'motorista'
      ? 'Motorista (PF)'
      : 'Entregador (PF)';

  const formattedDocument = formatCpfOrCnpj(
    currentUser.documentNumber || currentUser.document,
    currentUser.personType
  );

  const handleSaveBasicInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBasicMsg(null);
    if (!nameInput.trim()) {
      setBasicMsg({
        type: 'err',
        text: 'Informe o nome de exibição ou nome da loja.',
      });
      return;
    }

    if (emailInput.trim() && !isValidEmail(emailInput)) {
      setBasicMsg({
        type: 'err',
        text: 'Informe um endereço de e-mail válido (ex.: nome@dominio.com).',
      });
      return;
    }

    setIsSavingBasic(true);
    try {
      const updated = await updateBasicAccountInfoInSupabase({
        profileId: currentUser.id,
        name: nameInput,
        email: emailInput.trim() ? normalizeEmail(emailInput) : '',
        acceptsMarketing: acceptsMarketingInput,
      });
      onProfileUpdated(updated, 'Dados de perfil e e-mail salvos no Supabase.');
      setBasicMsg({
        type: 'ok',
        text: 'Nome, e-mail e preferência de comunicação atualizados com sucesso.',
      });
    } catch (err) {
      setBasicMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atualizar dados.',
      });
    } finally {
      setIsSavingBasic(false);
    }
  };

  const handleSavePixKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setPixMsg(null);
    if (!pixKeyInput.trim()) {
      setPixMsg({
        type: 'err',
        text: 'Informe uma Chave Pix válida (CPF, telefone, e-mail ou chave aleatória).',
      });
      return;
    }

    setIsSavingPix(true);
    try {
      const updated = await updatePixKeyInSupabase(
        currentUser.id,
        pixKeyInput.trim()
      );
      onProfileUpdated(updated, 'Chave Pix salva com sucesso no Supabase.');
      setPixMsg({
        type: 'ok',
        text:
          currentUser.role === 'admin'
            ? 'Chave Pix oficial da plataforma atualizada no Supabase.'
            : 'Sua Chave Pix para recebimentos foi atualizada no Supabase.',
      });
    } catch (err) {
      setPixMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar Chave Pix.',
      });
    } finally {
      setIsSavingPix(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVehicleMsg(null);
    setIsCompressingAvatar(true);
    try {
      const compressed = await compressImageToJpeg(file, 280, 0.72);
      setAvatarUrlInput(compressed);
    } catch (err) {
      setVehicleMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Erro ao processar foto do entregador.',
      });
    } finally {
      setIsCompressingAvatar(false);
      e.target.value = '';
    }
  };

  const handleVehicleCategoryChange = (nextVehicle: VehicleType) => {
    setVehicleTypeInput(nextVehicle);
    const allowed = getPropulsionOptionsForVehicle(nextVehicle);
    if (!allowed.includes(propulsionInput)) {
      setPropulsionInput(allowed[0]);
    }
    if (nextVehicle === 'Bike') {
      setPlateInput('');
    }
  };

  const handleSaveCourierIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setVehicleMsg(null);

    if (!vehicleModelInput.trim() || !vehicleColorInput.trim()) {
      setVehicleMsg({
        type: 'err',
        text: 'Informe o modelo e a cor do veículo (ex.: Honda CG 160 / Preta).',
      });
      return;
    }

    if (vehicleTypeInput !== 'Bike') {
      if (!plateInput.trim() || !isValidBrazilianPlate(plateInput)) {
        setVehicleMsg({
          type: 'err',
          text: 'Informe uma placa válida em letras maiúsculas (ex.: ABC1D23 ou ABC-1234).',
        });
        return;
      }
    }

    setIsSavingVehicle(true);
    try {
      const updated = await updateCourierIdentityInSupabase({
        profileId: currentUser.id,
        avatarUrl: avatarUrlInput || null,
        vehicleType: vehicleTypeInput,
        propulsion: propulsionInput,
        vehicleModel: vehicleModelInput,
        vehicleColor: vehicleColorInput,
        plate: vehicleTypeInput === 'Bike' ? '' : plateInput,
        bikeMaxRadiusKm: currentUser.bikeMaxRadiusKm,
      });
      onProfileUpdated(
        updated,
        'Identificação visual e dados do veículo atualizados no Supabase.'
      );
      setVehicleMsg({
        type: 'ok',
        text: 'Foto, modelo/cor e placa salvos com sucesso.',
      });
    } catch (err) {
      setVehicleMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Erro ao atualizar identificação do veículo.',
      });
    } finally {
      setIsSavingVehicle(false);
    }
  };

  const handleSavePhoneIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneMsg(null);

    if (!phoneInput.trim()) {
      setPhoneMsg({
        type: 'err',
        text: 'Informe o novo telefone ou identificador de acesso.',
      });
      return;
    }
    if (!/^\d{4}$/.test(phonePin.trim())) {
      setPhoneMsg({
        type: 'err',
        text: 'Confirme seu PIN atual de 4 dígitos.',
      });
      return;
    }
    if (currentUser.twoFactorEnabled && !/^\d{6}$/.test(phoneTotp.trim())) {
      setPhoneMsg({
        type: 'err',
        text: 'Informe o código de 6 dígitos do autenticador.',
      });
      return;
    }

    setIsSavingPhone(true);
    try {
      const updated = await updateLoginIdentifierInSupabase({
        profileId: currentUser.id,
        newPhone: phoneInput,
        currentPin: phonePin,
        totpCode: currentUser.twoFactorEnabled ? phoneTotp : undefined,
      });
      setPhonePin('');
      setPhoneTotp('');
      onProfileUpdated(updated, 'Identificador de login atualizado no Supabase.');
      setPhoneMsg({
        type: 'ok',
        text: 'Telefone / usuário de login atualizado com segurança.',
      });
    } catch (err) {
      setPhoneMsg({
        type: 'err',
        text:
          err instanceof Error ? err.message : 'Erro ao alterar identificador.',
      });
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);

    if (!/^\d{4}$/.test(currentPin.trim())) {
      setPinMsg({ type: 'err', text: 'Informe seu PIN atual de 4 dígitos.' });
      return;
    }
    if (!/^\d{4}$/.test(newPin.trim())) {
      setPinMsg({
        type: 'err',
        text: 'O novo PIN deve conter exatamente 4 dígitos numéricos.',
      });
      return;
    }
    if (newPin.trim() !== confirmNewPin.trim()) {
      setPinMsg({
        type: 'err',
        text: 'A confirmação do novo PIN não coincide.',
      });
      return;
    }
    if (currentUser.twoFactorEnabled && !/^\d{6}$/.test(pinTotp.trim())) {
      setPinMsg({
        type: 'err',
        text: 'Digite o código de 6 dígitos do autenticador.',
      });
      return;
    }

    setIsSavingPin(true);
    try {
      await updateAccessPinInSupabase({
        profileId: currentUser.id,
        currentPin,
        newPin,
        totpCode: currentUser.twoFactorEnabled ? pinTotp : undefined,
      });
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setPinTotp('');
      setPinMsg({
        type: 'ok',
        text: 'PIN de acesso alterado com sucesso no Supabase.',
      });
    } catch (err) {
      setPinMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao alterar PIN.',
      });
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleStart2FASetup = async () => {
    setTwoFaMsg(null);
    const secret = generateBase32Secret(20);
    const uri = buildOtpAuthUri(currentUser.name, secret);

    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 200,
        margin: 2,
        color: {
          dark: '#18181b',
          light: '#ffffff',
        },
      });
      setSetupSecret(secret);
      setQrDataUrl(dataUrl);
      setSetupOtpCode('');
      setCopiedSecret(false);
    } catch (err) {
      setTwoFaMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Erro ao gerar QR Code do autenticador.',
      });
    }
  };

  const handleCopySecret = async () => {
    if (!setupSecret) return;
    try {
      await navigator.clipboard.writeText(setupSecret);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 2500);
    } catch {
      // Fallback: user can still copy directly from input/text
    }
  };

  const handleConfirmEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupSecret) return;
    setTwoFaMsg(null);

    if (!/^\d{6}$/.test(setupOtpCode.trim())) {
      setTwoFaMsg({
        type: 'err',
        text: 'Digite o código de 6 dígitos gerado pelo seu aplicativo autenticador.',
      });
      return;
    }

    setIsSaving2FA(true);
    try {
      const updated = await enableTwoFactorInSupabase({
        profileId: currentUser.id,
        secret: setupSecret,
        totpCode: setupOtpCode.trim(),
      });
      setSetupSecret(null);
      setQrDataUrl(null);
      setSetupOtpCode('');
      onProfileUpdated(
        updated,
        'Verificação em Duas Etapas (2FA) ativada no Supabase!'
      );
      setTwoFaMsg({
        type: 'ok',
        text: '2FA ativado com sucesso. Seu próximo acesso solicitará o código do autenticador.',
      });
    } catch (err) {
      setTwoFaMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao ativar 2FA.',
      });
    } finally {
      setIsSaving2FA(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFaMsg(null);

    if (!/^\d{4}$/.test(disablePin.trim())) {
      setTwoFaMsg({
        type: 'err',
        text: 'Informe seu PIN atual de 4 dígitos.',
      });
      return;
    }
    if (!/^\d{6}$/.test(disableTotp.trim())) {
      setTwoFaMsg({
        type: 'err',
        text: 'Informe o código atual de 6 dígitos do autenticador.',
      });
      return;
    }

    setIsSaving2FA(true);
    try {
      const updated = await disableTwoFactorInSupabase({
        profileId: currentUser.id,
        currentPin: disablePin,
        totpCode: disableTotp,
      });
      setShowDisable2FA(false);
      setDisablePin('');
      setDisableTotp('');
      onProfileUpdated(
        updated,
        'Verificação em Duas Etapas (2FA) desativada.'
      );
      setTwoFaMsg({
        type: 'ok',
        text: '2FA desativado com sucesso.',
      });
    } catch (err) {
      setTwoFaMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao desativar 2FA.',
      });
    } finally {
      setIsSaving2FA(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Minha Conta e Segurança"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-950/60 p-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50 shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
              <Shield className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-zinc-900">
                Minha Conta e Segurança
              </h2>
              <p className="text-xs text-zinc-500">
                {currentUser.name} · {roleLabel} ·{' '}
                <span className="font-mono">{currentUser.phone}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Minha Conta"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Current Account Summary Strip */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-4 text-xs">
            <div>
              <span className="text-zinc-400 block">Nome</span>
              <strong className="text-zinc-900 font-semibold break-words">
                {currentUser.name}
              </strong>
            </div>
            <div>
              <span className="text-zinc-400 block">
                {currentUser.personType === 'PJ' ? 'CNPJ (PJ)' : 'CPF (PF)'}
              </span>
              <span className="font-mono font-medium text-zinc-800">
                {formattedDocument || 'Não informado'}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block">
                {canUsePixKey ? 'Chave Pix' : 'Acesso / Telefone'}
              </span>
              <span className="text-zinc-800 font-mono break-all">
                {canUsePixKey
                  ? currentUser.pixKey || 'Não cadastrada'
                  : currentUser.phone}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block">Perfil / 2FA</span>
              <span className="font-medium text-zinc-900">{roleLabel}</span>{' '}
              ·{' '}
              <span
                className={
                  currentUser.twoFactorEnabled
                    ? 'font-semibold text-emerald-700'
                    : 'text-amber-700 font-medium'
                }
              >
                {currentUser.twoFactorEnabled ? '2FA Ativo' : '2FA Inativo'}
              </span>
            </div>
          </div>

          {/* Section 1: Display Name & Recovery Email + Locked CPF/CNPJ */}
          <form
            onSubmit={handleSaveBasicInfo}
            className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
              <User className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-zinc-900">
                Dados de Exibição, Documento Validado e E-mail
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="acc-name"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  {currentUser.role === 'lojista' &&
                  currentUser.personType === 'PJ'
                    ? 'Nome da Loja / Exibição'
                    : 'Nome de Exibição'}
                </label>
                <input
                  id="acc-name"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="acc-email"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  E-mail de Recuperação / Segurança
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    id="acc-email"
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5 cursor-pointer text-xs text-zinc-700 leading-relaxed">
              <input
                type="checkbox"
                checked={acceptsMarketingInput}
                onChange={(e) => setAcceptsMarketingInput(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600 shrink-0"
              />
              <span>
                Aceito receber novidades, dicas operacionais e atualizações do
                RotaJusta por e-mail
              </span>
            </label>

            {/* Locked Validated Document (CPF / CNPJ) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5">
              <div>
                <label
                  htmlFor="acc-document-locked"
                  className="flex items-center justify-between text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  <span>
                    {currentUser.personType === 'PJ'
                      ? 'CNPJ Vinculado (PJ)'
                      : 'CPF Vinculado (PF)'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    <span>Bloqueado</span>
                  </span>
                </label>
                <input
                  id="acc-document-locked"
                  type="text"
                  readOnly
                  disabled
                  value={formattedDocument || 'Não informado'}
                  className="w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 font-mono text-xs font-semibold text-zinc-700"
                />
              </div>

              {currentUser.personType === 'PJ' && (
                <div>
                  <label
                    htmlFor="acc-legal-name-locked"
                    className="flex items-center justify-between text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    <span>Razão Social (Receita Federal)</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <span>Ativa</span>
                    </span>
                  </label>
                  <input
                    id="acc-legal-name-locked"
                    type="text"
                    readOnly
                    disabled
                    value={currentUser.companyLegalName || currentUser.name}
                    className="w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs text-zinc-700"
                  />
                </div>
              )}
            </div>

            {basicMsg && (
              <p
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  basicMsg.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {basicMsg.text}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingBasic}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSavingBasic ? 'Salvando...' : 'Salvar Nome e E-mail'}
              </button>
            </div>
          </form>

          {/* Section 1.25: Foto, Modelo/Cor e Placa (Entregador / Motorista) */}
          {isCourierProfile && (
            <form
              onSubmit={handleSaveCourierIdentity}
              className="rounded-xl border border-emerald-200 bg-white p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  {vehicleTypeInput === 'Bike' ? (
                    <Bike className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Truck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  )}
                  <h3 className="font-display text-sm font-semibold text-zinc-900">
                    Identificação Visual, Veículo e Placa
                  </h3>
                </div>
                <span className="text-[11px] font-medium text-emerald-700">
                  Exibidos ao cliente na corrida
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <CourierAvatar
                  name={currentUser.name}
                  avatarUrl={avatarUrlInput || undefined}
                  size="lg"
                />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="acc-courier-avatar"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
                    >
                      <Camera
                        className="h-3.5 w-3.5 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>
                        {isCompressingAvatar
                          ? 'Processando...'
                          : avatarUrlInput
                          ? 'Alterar Foto'
                          : 'Enviar Foto do Entregador'}
                      </span>
                      <input
                        id="acc-courier-avatar"
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleAvatarUpload(e)}
                        className="sr-only"
                      />
                    </label>
                    {avatarUrlInput && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrlInput('')}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Remover</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Sua foto ajuda o lojista e o cliente a confirmarem sua identidade
                    com segurança.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="acc-vehicle-type"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Tipo de Veículo
                  </label>
                  <select
                    id="acc-vehicle-type"
                    value={vehicleTypeInput}
                    onChange={(e) =>
                      handleVehicleCategoryChange(e.target.value as VehicleType)
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {VEHICLE_CATEGORIES.map((vt) => (
                      <option key={vt} value={vt}>
                        {vt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="acc-propulsion"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Propulsão
                  </label>
                  <select
                    id="acc-propulsion"
                    value={propulsionInput}
                    onChange={(e) =>
                      setPropulsionInput(e.target.value as PropulsionType)
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {getPropulsionOptionsForVehicle(vehicleTypeInput).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="acc-vehicle-model"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Modelo do Veículo
                  </label>
                  <input
                    id="acc-vehicle-model"
                    type="text"
                    value={vehicleModelInput}
                    onChange={(e) => setVehicleModelInput(e.target.value)}
                    placeholder="Ex: Honda CG 160"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="acc-vehicle-color"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Cor do Veículo
                  </label>
                  <input
                    id="acc-vehicle-color"
                    type="text"
                    value={vehicleColorInput}
                    onChange={(e) => setVehicleColorInput(e.target.value)}
                    placeholder="Ex: Preta"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="acc-vehicle-plate"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Placa{' '}
                    {vehicleTypeInput === 'Bike' && (
                      <span className="font-normal text-zinc-400">
                        (opcional)
                      </span>
                    )}
                  </label>
                  <input
                    id="acc-vehicle-plate"
                    type="text"
                    maxLength={8}
                    disabled={vehicleTypeInput === 'Bike'}
                    value={plateInput}
                    onChange={(e) =>
                      setPlateInput(formatPlateInput(e.target.value))
                    }
                    placeholder={
                      vehicleTypeInput === 'Bike' ? 'Bicicleta' : 'ABC1D23'
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-zinc-900 focus:border-emerald-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                </div>
              </div>

              {vehicleMsg && (
                <p
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    vehicleMsg.type === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {vehicleMsg.text}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingVehicle}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSavingVehicle
                    ? 'Salvando...'
                    : 'Salvar Foto e Dados do Veículo'}
                </button>
              </div>
            </form>
          )}

          {/* Section 1.5: Chave Pix (Entregador / Motorista / Admin) */}
          {canUsePixKey && (
            <form
              onSubmit={handleSavePixKey}
              className="rounded-xl border border-emerald-200 bg-white p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <QrCode
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  <h3 className="font-display text-sm font-semibold text-zinc-900">
                    {currentUser.role === 'admin'
                      ? 'Chave Pix Oficial da Plataforma RotaJusta'
                      : 'Chave Pix para Recebimentos'}
                  </h3>
                </div>
                <span className="text-[11px] font-medium text-emerald-700">
                  {currentUser.role === 'admin'
                    ? 'Exibida nos pedidos Pix Plataforma'
                    : 'Exibida para Pix Direto e repasses'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="acc-pix-type"
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    Tipo de Chave Pix
                  </label>
                  <select
                    id="acc-pix-type"
                    value={pixKeyType}
                    onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 focus:outline-none"
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
                    htmlFor="acc-pix-key"
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    Chave Pix
                  </label>
                  <input
                    id="acc-pix-key"
                    type="text"
                    value={pixKeyInput}
                    onChange={(e) => setPixKeyInput(e.target.value)}
                    placeholder={getPixKeyPlaceholder(pixKeyType)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {pixMsg && (
                <p
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    pixMsg.type === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {pixMsg.text}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingPix}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSavingPix ? 'Salvando...' : 'Salvar Chave Pix'}
                </button>
              </div>
            </form>
          )}

          {/* Section 2: Login Identifier (Phone / admin) - Sensitive */}
          <form
            onSubmit={handleSavePhoneIdentifier}
            className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <h3 className="font-display text-sm font-semibold text-zinc-900">
                  Alterar Identificador de Acesso (Telefone ou Usuário)
                </h3>
              </div>
              <span className="text-[11px] font-medium text-zinc-500">
                Requer PIN atual{currentUser.twoFactorEnabled ? ' + 2FA' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="acc-phone"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  Novo Telefone ou Usuário
                </label>
                <input
                  id="acc-phone"
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="(51) 99999-0000 ou admin"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="acc-phone-pin"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  PIN Atual (4 dígitos)
                </label>
                <input
                  id="acc-phone-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={phonePin}
                  onChange={(e) =>
                    setPhonePin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="••••"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.25em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {currentUser.twoFactorEnabled && (
                <div>
                  <label
                    htmlFor="acc-phone-totp"
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    Código 2FA (6 dígitos)
                  </label>
                  <input
                    id="acc-phone-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneTotp}
                    onChange={(e) =>
                      setPhoneTotp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.2em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {phoneMsg && (
              <p
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  phoneMsg.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {phoneMsg.text}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingPhone}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              >
                {isSavingPhone ? 'Atualizando...' : 'Atualizar Identificador'}
              </button>
            </div>
          </form>

          {/* Section 3: Change Access PIN - Sensitive */}
          <form
            onSubmit={handleChangePin}
            className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <h3 className="font-display text-sm font-semibold text-zinc-900">
                  Alterar PIN / Senha de Acesso (4 dígitos)
                </h3>
              </div>
              <span className="text-[11px] font-medium text-zinc-500">
                Requer PIN atual{currentUser.twoFactorEnabled ? ' + 2FA' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="acc-cur-pin"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  PIN Atual
                </label>
                <input
                  id="acc-cur-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPin}
                  onChange={(e) =>
                    setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="••••"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.25em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="acc-new-pin"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  Novo PIN (4 dígitos)
                </label>
                <input
                  id="acc-new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) =>
                    setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="••••"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.25em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="acc-confirm-pin"
                  className="block text-xs font-semibold text-zinc-700 mb-1.5"
                >
                  Confirmar Novo PIN
                </label>
                <input
                  id="acc-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmNewPin}
                  onChange={(e) =>
                    setConfirmNewPin(
                      e.target.value.replace(/\D/g, '').slice(0, 4)
                    )
                  }
                  placeholder="••••"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.25em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {currentUser.twoFactorEnabled && (
                <div>
                  <label
                    htmlFor="acc-pin-totp"
                    className="block text-xs font-semibold text-zinc-700 mb-1.5"
                  >
                    Código 2FA (6 dígitos)
                  </label>
                  <input
                    id="acc-pin-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinTotp}
                    onChange={(e) =>
                      setPinTotp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.2em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {pinMsg && (
              <p
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  pinMsg.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {pinMsg.text}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingPin}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              >
                {isSavingPin ? 'Alterando...' : 'Alterar PIN de Acesso'}
              </button>
            </div>
          </form>

          {/* Section 4: Verificação em Duas Etapas (2FA TOTP) */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
                <h3 className="font-display text-sm font-semibold text-zinc-900">
                  Verificação em Duas Etapas (2FA · Google Authenticator / Authy)
                </h3>
              </div>

              {currentUser.twoFactorEnabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 w-fit">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>2FA Ativada</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 w-fit">
                  <span>Desativada</span>
                </span>
              )}
            </div>

            {!currentUser.twoFactorEnabled ? (
              !setupSecret ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-600 leading-relaxed max-w-xl">
                    Proteja sua conta com códigos TOTP de 6 dígitos gerados a cada 30
                    segundos pelo Google Authenticator ou Authy.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleStart2FASetup()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    <span>Ativar 2FA</span>
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleConfirmEnable2FA}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-4"
                >
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-12 items-center">
                    {qrDataUrl && (
                      <div className="sm:col-span-4 flex flex-col items-center">
                        <img
                          src={qrDataUrl}
                          alt="QR Code 2FA RotaJusta"
                          className="h-40 w-40 rounded-lg border border-zinc-200 bg-white p-1.5"
                        />
                        <span className="mt-1.5 text-[11px] text-zinc-500 text-center">
                          Escaneie no Google Authenticator / Authy
                        </span>
                      </div>
                    )}

                    <div className="sm:col-span-8 space-y-3">
                      <p className="text-xs text-zinc-700 leading-relaxed">
                        <strong>Passo 1:</strong> Escaneie o QR Code ao lado ou copie
                        a chave secreta Base32 abaixo no seu aplicativo autenticador:
                      </p>

                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs font-semibold text-zinc-900 break-all">
                          {setupSecret}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleCopySecret()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 shrink-0"
                        >
                          {copiedSecret ? (
                            <>
                              <Check
                                className="h-3.5 w-3.5 text-emerald-600"
                                aria-hidden="true"
                              />
                              <span>Copiada</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div>
                        <label
                          htmlFor="setup-totp-code"
                          className="block text-xs font-semibold text-zinc-800 mb-1.5"
                        >
                          Passo 2: Digite o código de 6 dígitos do autenticador para
                          confirmar
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            id="setup-totp-code"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={setupOtpCode}
                            onChange={(e) =>
                              setSetupOtpCode(
                                e.target.value.replace(/\D/g, '').slice(0, 6)
                              )
                            }
                            placeholder="000000"
                            className="w-36 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tracking-[0.25em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isSaving2FA}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {isSaving2FA
                              ? 'Validando...'
                              : 'Confirmar e Ativar 2FA'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSetupSecret(null);
                              setQrDataUrl(null);
                              setSetupOtpCode('');
                            }}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              )
            ) : !showDisable2FA ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-600 leading-relaxed max-w-xl">
                  Sua conta exige código de 6 dígitos do autenticador no login e em
                  alterações sensíveis.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowDisable2FA(true);
                    setTwoFaMsg(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 whitespace-nowrap shrink-0"
                >
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Desativar 2FA</span>
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleDisable2FA}
                className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3"
              >
                <p className="text-xs font-semibold text-red-900">
                  Para desativar o 2FA, confirme seu PIN atual e o código de 6 dígitos
                  do autenticador:
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="disable-2fa-pin"
                      className="block text-xs font-semibold text-zinc-700 mb-1"
                    >
                      PIN Atual (4 dígitos)
                    </label>
                    <input
                      id="disable-2fa-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={disablePin}
                      onChange={(e) =>
                        setDisablePin(
                          e.target.value.replace(/\D/g, '').slice(0, 4)
                        )
                      }
                      placeholder="••••"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.25em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="disable-2fa-totp"
                      className="block text-xs font-semibold text-zinc-700 mb-1"
                    >
                      Código 2FA Atual (6 dígitos)
                    </label>
                    <input
                      id="disable-2fa-totp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={disableTotp}
                      onChange={(e) =>
                        setDisableTotp(
                          e.target.value.replace(/\D/g, '').slice(0, 6)
                        )
                      }
                      placeholder="000000"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.2em] text-zinc-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSaving2FA}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {isSaving2FA ? 'Desativando...' : 'Confirmar Desativação'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisable2FA(false);
                      setDisablePin('');
                      setDisableTotp('');
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {twoFaMsg && (
              <p
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  twoFaMsg.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {twoFaMsg.text}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
