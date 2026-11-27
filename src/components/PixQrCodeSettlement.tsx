import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, CheckCircle2, Copy, QrCode } from 'lucide-react';
import { PaymentStatus } from '../types';
import { buildPixCopyPastePayload } from '../utils/pix';
import { formatBRL } from '../utils/pricing';

interface PixQrCodeSettlementProps {
  orderCode: string;
  amount: number;
  recipientName: string;
  pixKey?: string | null;
  paymentStatus?: PaymentStatus;
  viewerRole: 'merchant' | 'courier';
  isConfirming?: boolean;
  onConfirmAction?: () => Promise<void>;
  confirmButtonLabel?: string;
}

export function PixQrCodeSettlement({
  orderCode,
  amount,
  recipientName,
  pixKey,
  paymentStatus,
  viewerRole,
  isConfirming = false,
  onConfirmAction,
  confirmButtonLabel,
}: PixQrCodeSettlementProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<'key' | 'payload' | null>(null);

  const trimmedKey = (pixKey || '').trim();

  const pixPayload = useMemo(() => {
    if (!trimmedKey) return '';
    return buildPixCopyPastePayload({
      pixKey: trimmedKey,
      amount,
      recipientName,
      orderCode,
    });
  }, [trimmedKey, amount, recipientName, orderCode]);

  useEffect(() => {
    let cancelled = false;
    if (!pixPayload) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(pixPayload, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#09090b',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pixPayload]);

  const handleCopy = async (field: 'key' | 'payload', value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2500);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  const isCompleted = paymentStatus === 'repassado';
  const showConfirmButton = Boolean(
    onConfirmAction &&
      (viewerRole === 'courier'
        ? !isCompleted
        : !paymentStatus || paymentStatus === 'pendente_pagamento')
  );

  const defaultButtonLabel =
    viewerRole === 'courier'
      ? 'Confirmar Pagamento Recebido'
      : 'Confirmar Pagamento Enviado';

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-3.5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2.5">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span className="text-xs sm:text-sm font-bold text-zinc-900">
            QR Code Pix · Acerto {orderCode}
          </span>
        </div>
        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-800 tabular-nums">
          {formatBRL(amount)}
        </span>
      </div>

      {!trimmedKey ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {viewerRole === 'courier'
            ? 'Cadastre sua Chave Pix na aba Financeiro para gerar automaticamente o QR Code Pix e o código Copia e Cola para esta entrega.'
            : 'O favorecido ainda não cadastrou a Chave Pix para geração do QR Code. Peça para cadastrar ou conclua após combinar o acerto.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 items-center">
          <div className="sm:col-span-5 flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code Pix da corrida ${orderCode} no valor de ${formatBRL(amount)}`}
                className="h-40 w-40 rounded-lg border border-zinc-200 bg-white p-1 object-contain"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white text-xs text-zinc-400">
                Gerando QR Code...
              </div>
            )}
            <span className="mt-2 text-[11px] font-medium text-zinc-600 text-center">
              Escaneie no app do banco · {orderCode}
            </span>
          </div>

          <div className="sm:col-span-7 space-y-3 text-xs">
            <div className="space-y-1">
              <p className="text-zinc-600">
                Favorecido:{' '}
                <strong className="text-zinc-900">{recipientName}</strong>
              </p>
              <p className="text-zinc-600">
                Valor da entrega:{' '}
                <strong className="font-mono text-emerald-700 tabular-nums">
                  {formatBRL(amount)}
                </strong>
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-zinc-600">Chave Pix:</span>
                <code className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono font-semibold text-zinc-900 break-all">
                  {trimmedKey}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy('key', trimmedKey)}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                >
                  {copiedField === 'key' ? (
                    <>
                      <Check
                        className="h-3 w-3 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>Chave Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      <span>Copiar Chave</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {pixPayload && (
              <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-zinc-700">
                    Pix Copia e Cola ({orderCode})
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopy('payload', pixPayload)}
                    className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
                  >
                    {copiedField === 'payload' ? (
                      <>
                        <Check
                          className="h-3 w-3 text-emerald-400"
                          aria-hidden="true"
                        />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        <span>Copiar Pix Copia e Cola</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="font-mono text-[10px] leading-relaxed text-zinc-600 break-all line-clamp-3 select-all">
                  {pixPayload}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {isCompleted ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>
            Acerto concluído entre lojista e entregador ({orderCode}).
          </span>
        </div>
      ) : (
        showConfirmButton && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-zinc-100 pt-2.5">
            <span className="text-[11px] text-zinc-500">
              {viewerRole === 'courier'
                ? 'Após conferir o crédito na sua conta, confirme o recebimento para concluir o acerto.'
                : 'Após escanear ou colar o código no seu banco, confirme o envio do pagamento.'}
            </span>
            <button
              type="button"
              disabled={isConfirming}
              onClick={() => void onConfirmAction?.()}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>
                {isConfirming
                  ? 'Confirmando...'
                  : confirmButtonLabel || defaultButtonLabel}
              </span>
            </button>
          </div>
        )
      )}
    </div>
  );
}
