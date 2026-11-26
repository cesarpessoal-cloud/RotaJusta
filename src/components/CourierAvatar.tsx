import { getNameInitials, normalizePlateForDisplay } from '../utils/courierIdentity';

interface CourierAvatarProps {
  name?: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CourierAvatar({
  name,
  avatarUrl,
  size = 'md',
  className = '',
}: CourierAvatarProps) {
  const sizeClasses =
    size === 'lg'
      ? 'h-16 w-16 text-lg rounded-2xl'
      : size === 'sm'
      ? 'h-9 w-9 text-xs rounded-xl'
      : 'h-12 w-12 text-sm rounded-xl';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`Foto de ${name || 'Entregador'}`}
        className={`${sizeClasses} object-cover border border-zinc-200 bg-zinc-100 shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      aria-label={`Iniciais de ${name || 'Entregador'}`}
      className={`${sizeClasses} inline-flex items-center justify-center bg-zinc-900 text-emerald-400 font-display font-bold border border-zinc-800 shrink-0 select-none ${className}`}
    >
      {getNameInitials(name)}
    </span>
  );
}

interface VehiclePlateBadgeProps {
  plate?: string | null;
  size?: 'sm' | 'md';
  compact?: boolean;
}

export function VehiclePlateBadge({
  plate,
  size = 'md',
  compact = false,
}: VehiclePlateBadgeProps) {
  const formatted = normalizePlateForDisplay(plate);
  if (!formatted) return null;

  const resolvedSize = compact ? 'sm' : size;
  if (resolvedSize === 'sm') {
    return (
      <span className="inline-flex flex-col overflow-hidden rounded border border-zinc-900 bg-white shadow-2xs shrink-0">
        <span className="bg-blue-700 px-1.5 py-[1px] text-[7px] font-extrabold tracking-widest text-white text-center leading-none">
          BRASIL
        </span>
        <span className="px-2 py-0.5 font-mono text-xs font-black tracking-wider text-zinc-950 leading-none">
          {formatted}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col overflow-hidden rounded-md border-2 border-zinc-900 bg-white shadow-xs shrink-0">
      <span className="bg-blue-700 px-2.5 py-[2px] text-[8px] font-extrabold tracking-widest text-white text-center leading-none">
        BRASIL · POA
      </span>
      <span className="px-3 py-1 font-mono text-sm sm:text-base font-black tracking-widest text-zinc-950 leading-none text-center">
        {formatted}
      </span>
    </span>
  );
}
