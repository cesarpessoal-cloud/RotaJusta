import { useEffect, useState } from 'react';
import { FileText, ShieldCheck, X } from 'lucide-react';

export type LegalDocTab = 'termos' | 'privacidade';

interface LegalModalProps {
  initialTab: LegalDocTab;
  onClose: () => void;
  onAccept?: () => void;
}

export function LegalModal({
  initialTab,
  onClose,
  onAccept,
}: LegalModalProps) {
  const [activeTab, setActiveTab] = useState<LegalDocTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 sm:px-6">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              RotaJusta · Porto Alegre e Região Metropolitana (RS)
            </p>
            <h2
              id="legal-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-zinc-950"
            >
              {activeTab === 'termos'
                ? 'Termos de Uso da Plataforma'
                : 'Política de Privacidade (LGPD)'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Document Switcher */}
        <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-2.5 sm:px-6">
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-zinc-200/70 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('termos')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'termos'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <FileText
                className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                aria-hidden="true"
              />
              <span>Termos de Uso</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('privacidade')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'privacidade'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <ShieldCheck
                className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                aria-hidden="true"
              />
              <span>Política de Privacidade</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 space-y-5 text-sm text-zinc-700 leading-relaxed">
          {activeTab === 'termos' ? (
            <>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-bold text-zinc-950">
                  1. Natureza da Plataforma e Autonomia
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  O <strong>RotaJusta</strong> atua exclusivamente como
                  plataforma tecnológica de intermediação e conexão entre
                  solicitantes (pessoas físicas e estabelecimentos/lojistas
                  PJ) e entregadores ou motoristas independentes que operam em{' '}
                  <strong>Porto Alegre e região metropolitana (RS)</strong>. O
                  uso do aplicativo não estabelece vínculo empregatício,
                  trabalhista, societário ou de subordinação entre o RotaJusta
                  e os condutores parceiros ou solicitantes.
                </p>
              </section>

              <section className="space-y-1.5 rounded-xl border border-red-200 bg-red-50/60 p-3.5">
                <h3 className="font-display text-sm font-bold text-red-950">
                  2. Proibição de Uso Indevido e Cargas Ilícitas
                </h3>
                <p className="text-xs sm:text-sm text-red-900 leading-relaxed">
                  É expressamente proibido utilizar o RotaJusta para solicitar,
                  enviar ou transportar{' '}
                  <strong>
                    substâncias ilícitas, armas de fogo, munições, explosivos,
                    materiais inflamáveis ou químicos perigosos, dinheiro em
                    espécie de alto valor, animais vivos, bens de origem
                    ilícita ou qualquer item proibido pela legislação brasileira
                  </strong>
                  . O solicitante assume responsabilidade civil e criminal
                  exclusiva pela veracidade da declaração, licitude e
                  embalagem segura do item entregue ao condutor.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-bold text-zinc-950">
                  3. Pagamentos Diretos via Pix
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Os valores apresentados antes da confirmação da corrida
                  seguem tabela transparente por modalidade e distância. Quando
                  utilizada a opção <strong>Pix Direto ao Entregador</strong>,
                  o pagamento é transferido diretamente do solicitante para a
                  Chave Pix do condutor após a aceitação, sem retenção pela
                  plataforma (com taxa zerada para bicicletas e veículos
                  elétricos). Cabe às partes conferir o titular, o valor e o
                  comprovante bancário no ato da operação.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-bold text-zinc-950">
                  4. Conduta, Avaliações e Bloqueio de Contas
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Solicitantes e entregadores comprometem-se a manter respeito
                  mútuo, pontualidade nas coletas e entregas, endereços exatos
                  e registro verdadeiro da entrega com foto quando aplicável. As
                  avaliações por estrelas refletem a qualidade do atendimento. O
                  RotaJusta poderá suspender ou bloquear definitivamente contas
                  em caso de tentativa de fraude, documentação irregular,
                  cancelamentos abusivos, conduta desrespeitosa ou violação
                  destes Termos.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-bold text-zinc-950">
                  5. Foro e Disposições Gerais
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Estes Termos são regidos pelas leis da República Federativa do
                  Brasil, elegendo-se o foro da Comarca de{' '}
                  <strong>Porto Alegre/RS</strong> para dirimir eventuais
                  controvérsias.
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-bold text-zinc-950">
                  1. Compromisso com a LGPD (Lei nº 13.709/2018)
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  O <strong>RotaJusta</strong> trata os dados pessoais de seus
                  usuários em estrita conformidade com a Lei Geral de Proteção
                  de Dados (LGPD), adotando princípios de finalidade,
                  necessidade, transparência e segurança.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-bold text-zinc-950">
                  2. Dados Coletados e Finalidade Exclusiva
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Para operar entregas e fretes em Porto Alegre e região
                  metropolitana, coletamos dados como{' '}
                  <strong>
                    nome completo ou razão social, CPF/CNPJ, telefone/WhatsApp,
                    e-mail, endereços de coleta e entrega, informações do
                    veículo/CNH (para condutores) e Chave Pix
                  </strong>
                  , além de fotos de comprovação e avaliações de corridas.
                  Essas informações são usadas exclusivamente para:
                </p>
                <ul className="list-disc pl-5 text-xs sm:text-sm text-zinc-600 space-y-1">
                  <li>
                    Execução, cálculo de rota por CEP e acompanhamento das
                    entregas;
                  </li>
                  <li>
                    Viabilização dos pagamentos e repasses via Pix entre as
                    partes;
                  </li>
                  <li>
                    Validação cadastral, prevenção a fraudes e segurança
                    operacional.
                  </li>
                </ul>
              </section>

              <section className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                <h3 className="font-display text-sm font-bold text-emerald-950">
                  3. Proibição de Venda de Dados
                </h3>
                <p className="text-xs sm:text-sm text-emerald-900 leading-relaxed">
                  <strong>
                    Seus dados pessoais ou empresariais jamais são vendidos,
                    alugados ou cedidos para fins comerciais ou de marketing de
                    terceiros.
                  </strong>{' '}
                  Durante uma corrida, apenas os dados estritamente necessários
                  à coleta, entrega e pagamento Pix são exibidos entre o
                  solicitante e o entregador responsável.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-bold text-zinc-950">
                  4. Direitos do Titular e Exclusão da Conta
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                  Você pode revisar e atualizar seus dados cadastrais e Chave
                  Pix a qualquer momento na opção <strong>Minha Conta</strong>.
                  O usuário também pode solicitar a{' '}
                  <strong>
                    exclusão definitiva da sua conta e dos seus dados pessoais
                  </strong>{' '}
                  a qualquer tempo junto à administração do RotaJusta,
                  ressalvados os registros necessários ao cumprimento de
                  obrigações legais ou auditoria de segurança.
                </p>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Fechar
          </button>
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Li e Aceito os Termos e Privacidade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
