import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{compact ? 'Instalar App' : 'Instalar no Celular'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
          <span>{compact ? 'Instalar App' : 'Instalar no iPhone'}</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/apple-touch-icon.png"
                    alt="Ícone RotaJusta"
                    className="h-10 w-10 rounded-xl border border-emerald-200"
                  />
                  <div>
                    <h3
                      id="ios-install-title"
                      className="font-display text-base font-bold text-zinc-900"
                    >
                      Instalar RotaJusta no iPhone
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Acesso rápido em tela cheia
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fechar instruções"
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <ol className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-xs text-zinc-700">
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-emerald-700">1.</span>
                  <span>
                    Toque no botão{' '}
                    <strong className="inline-flex items-center gap-1 text-zinc-900">
                      Compartilhar <Share className="h-3.5 w-3.5 text-emerald-700" />
                    </strong>{' '}
                    na barra do Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-emerald-700">2.</span>
                  <span>
                    Role para baixo e toque em{' '}
                    <strong className="text-zinc-900">
                      Adicionar à Tela de Início
                    </strong>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-emerald-700">3.</span>
                  <span>
                    Confirme em <strong className="text-zinc-900">Adicionar</strong>{' '}
                    para abrir como aplicativo nativo.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
