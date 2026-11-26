import { useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';
import { Rating } from '../types';

interface RatingBadgeProps {
  avg?: number;
  count?: number;
  compact?: boolean;
}

export function RatingBadge({ avg, count, compact = false }: RatingBadgeProps) {
  const safeCount = count ?? 0;
  const safeAvg = avg ?? 0;

  if (safeCount <= 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 font-medium text-zinc-500 whitespace-nowrap ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
        }`}
        title="Ainda sem avaliações"
      >
        <Star className="h-3 w-3 text-zinc-400" aria-hidden="true" />
        <span>Novo</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 font-mono font-semibold text-amber-900 tabular-nums whitespace-nowrap ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
      title={`Nota média ${safeAvg.toFixed(1)} de 5 (${safeCount} avaliação(ões))`}
    >
      <Star
        className="h-3 w-3 fill-amber-400 text-amber-500 shrink-0"
        aria-hidden="true"
      />
      <span>
        {safeAvg.toFixed(1)} ({safeCount})
      </span>
    </span>
  );
}

interface OrderRatingBoxProps {
  buttonLabel: string;
  targetName: string;
  commentPlaceholder: string;
  existingRating?: Rating;
  canRate: boolean;
  unavailableNote?: string;
  onSubmit: (stars: number, comment: string) => Promise<void>;
}

export function OrderRatingBox({
  buttonLabel,
  targetName,
  commentPlaceholder,
  existingRating,
  canRate,
  unavailableNote,
  onSubmit,
}: OrderRatingBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stars, setStars] = useState<number>(5);
  const [hoverStars, setHoverStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (existingRating) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          <span>Avaliado</span>
        </span>
        <span className="inline-flex items-center gap-0.5 text-amber-500">
          {[1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className={`h-3.5 w-3.5 ${
                value <= existingRating.stars
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-zinc-300'
              }`}
              aria-hidden="true"
            />
          ))}
        </span>
        <span className="font-mono font-semibold text-zinc-800">
          {existingRating.stars}/5
        </span>
        {existingRating.comment && (
          <span className="text-zinc-600 italic truncate max-w-xs">
            &ldquo;{existingRating.comment}&rdquo;
          </span>
        )}
      </div>
    );
  }

  if (!canRate) {
    if (!unavailableNote) return null;
    return (
      <p className="text-[11px] text-zinc-400 italic">{unavailableNote}</p>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setErrorMsg(null);
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 whitespace-nowrap"
      >
        <Star
          className="h-3.5 w-3.5 fill-amber-400 text-amber-500"
          aria-hidden="true"
        />
        <span>{buttonLabel}</span>
      </button>
    );
  }

  const displayedStars = hoverStars ?? stars;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stars < 1 || stars > 5) {
      setErrorMsg('Selecione de 1 a 5 estrelas.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onSubmit(stars, comment.trim());
      setIsOpen(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao enviar avaliação.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-900">
          {buttonLabel}: <span className="text-emerald-800">{targetName}</span>
        </p>
        <div
          className="flex items-center gap-1"
          role="radiogroup"
          aria-label="Nota de 1 a 5 estrelas"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onMouseEnter={() => setHoverStars(value)}
              onMouseLeave={() => setHoverStars(null)}
              onClick={() => setStars(value)}
              aria-label={`${value} estrela${value > 1 ? 's' : ''}`}
              aria-checked={stars === value}
              role="radio"
              className="rounded p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-amber-500"
            >
              <Star
                className={`h-5 w-5 ${
                  value <= displayedStars
                    ? 'fill-amber-400 text-amber-500'
                    : 'text-zinc-300'
                }`}
                aria-hidden="true"
              />
            </button>
          ))}
          <span className="ml-1.5 font-mono text-xs font-bold text-amber-900 tabular-nums">
            {stars}.0
          </span>
        </div>
      </div>

      <input
        type="text"
        maxLength={220}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={commentPlaceholder}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none"
      />

      {errorMsg && (
        <p className="text-xs font-medium text-red-600">{errorMsg}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Star className="h-3.5 w-3.5 fill-white" aria-hidden="true" />
          <span>{isSubmitting ? 'Enviando...' : 'Enviar Avaliação'}</span>
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => setIsOpen(false)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
