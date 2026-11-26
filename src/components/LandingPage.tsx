import { useState } from 'react';
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  ClipboardCheck,
  Database,
  HeartHandshake,
  LogIn,
  MapPin,
  Package,
  Route,
  ShieldCheck,
  Store,
  Truck,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import heroPoaImage from '../assets/images/rotajusta_hero_poa_1795704483725.jpg';
import { RegProfileChoice } from './AuthScreen';
import { LegalDocTab, LegalModal } from './LegalModal';
import { PWAInstallButton } from './PWAInstallButton';

interface LandingPageProps {
  onlineCouriersCount: number;
  isLoadingOnlineCount: boolean;
  isDatabaseEmpty: boolean;
  isCheckingEmpty: boolean;
  isSeeding: boolean;
  dbError: string | null;
  onOpenLogin: () => void;
  onOpenRegister: (presetChoice: RegProfileChoice) => void;
  onSeedTestData: () => Promise<void>;
}

export function LandingPage({
  onlineCouriersCount,
  isLoadingOnlineCount,
  isDatabaseEmpty,
  isCheckingEmpty,
  isSeeding,
  dbError,
  onOpenLogin,
  onOpenRegister,
  onSeedTestData,
}: LandingPageProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<LegalDocTab | null>(null);

  const onlineText = isLoadingOnlineCount
    ? 'Verificando entregadores online em Porto Alegre...'
    : onlineCouriersCount === 1
    ? '1 entregador online em Porto Alegre'
    : `${onlineCouriersCount} entregadores online em Porto Alegre`;

  const scrollToHistory = () => {
    const el = document.getElementById('nossa-historia');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      {/* 1. Cabeçalho Fixo e Acesso Rápido */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs shrink-0">
              <Route className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-zinc-950 block leading-none">
                RotaJusta
              </span>
              <span className="hidden sm:block text-[11px] font-medium text-zinc-500 mt-0.5">
                Porto Alegre · RS
              </span>
            </div>
          </div>

          {/* Real-time Online Couriers Indicator (Desktop center) */}
          <div
            aria-live="polite"
            className="hidden lg:inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3.5 py-1.5 text-xs font-semibold text-emerald-950"
          >
            <span
              className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
              aria-hidden="true"
            />
            <span className="tabular-nums">{onlineText}</span>
          </div>

          {/* Navigation + Quick Auth Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={scrollToHistory}
              className="hidden md:inline-flex items-center rounded-lg px-2.5 py-2 text-xs sm:text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-emerald-700 whitespace-nowrap shrink-0"
            >
              Nossa História
            </button>
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 whitespace-nowrap shrink-0"
            >
              <LogIn className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenRegister('pf_solicitante')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cadastrar-se</span>
            </button>
          </div>
        </div>

        {/* Real-time Online Couriers + Mobile History Link Sub-strip */}
        <div className="border-t border-zinc-100 bg-emerald-50/60 px-4 py-1.5 lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-[11px] font-semibold text-emerald-950">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                aria-hidden="true"
              />
              <span className="tabular-nums truncate">{onlineText}</span>
            </div>
            <button
              type="button"
              onClick={scrollToHistory}
              className="md:hidden font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-950 whitespace-nowrap shrink-0"
            >
              Nossa História
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 2. Seção Principal (Banner de Impacto / Publicidade) */}
        <section className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-6 space-y-6">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Logística urbana justa · Porto Alegre (RS)</span>
                </div>

                <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.85rem] font-bold tracking-tight text-zinc-950 leading-[1.12]">
                  Entregas rápidas e fretes justos em Porto Alegre. Sem taxas
                  abusivas.
                </h1>

                <p className="text-base sm:text-lg text-zinc-600 leading-relaxed max-w-xl">
                  O RotaJusta conecta comércios locais, moradores e entregadores
                  com pagamento direto via Pix, transparência total no cálculo e
                  respeito real a quem trabalha na rua.
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenRegister('pf_solicitante')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
                  >
                    <Package className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Quero Enviar ou Pedir Frete</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenRegister('pf_entregador')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-zinc-800"
                  >
                    <Bike className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                    <span>Quero Fazer Entregas</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <PWAInstallButton />
                  <span className="text-xs text-zinc-500">
                    Acesse no computador ou instale direto no celular.
                  </span>
                </div>
              </div>

              <div className="lg:col-span-6 space-y-3">
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm">
                  {!heroImgFailed ? (
                    <img
                      src={heroPoaImage}
                      alt="Entregadora em veículo elétrico recolhendo encomendas em comércio local de rua arborizada em Porto Alegre"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-video w-full bg-zinc-900 p-8 flex flex-col justify-between text-white">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                        <Route className="h-4 w-4" aria-hidden="true" />
                        <span>Porto Alegre · Conexão Direta</span>
                      </div>
                      <p className="font-display text-2xl font-bold max-w-md">
                        Do Centro Histórico à Zona Sul, cada entrega com valor
                        transparente.
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
                        Taxa R$ 0,00 Bike e EV
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                  Incentivo EV
                </p>
                <p className="text-xs text-zinc-400">
                  Taxa zero para bikes e veículos elétricos em Porto Alegre.
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
                        Painel prático no computador e no celular para entregas
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
                      Para qualquer morador enviar pacotes ou contratar um
                      pequeno frete.
                    </p>
                  </div>

                  <ul className="space-y-2.5 text-sm text-zinc-700">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        Esqueceu uma chave, precisa enviar um documento ou
                        transportar um móvel pela cidade?
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                      Taxa Zero EV &amp; Bike
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
                          Incentivo especial para motos e carros elétricos (e
                          E-Bikes):
                        </strong>{' '}
                        taxa da plataforma zerada e convertida em bônus para
                        você.
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
              onClick={scrollToHistory}
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
