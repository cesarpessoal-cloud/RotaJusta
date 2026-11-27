import {
  Bike,
  CheckCircle2,
  Clock,
  Fuel,
  QrCode,
  ShieldAlert,
  Truck,
  Zap,
} from 'lucide-react';
import {
  ApprovalStatus,
  OrderStatus,
  PaymentStatus,
  PropulsionType,
  VehicleType,
} from '../types';
import { hasCleanMobilityDiscount } from '../utils/pricing';

export function FreightBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-gradient-to-r from-sky-50 to-amber-50 font-semibold text-sky-900 whitespace-nowrap shrink-0 ${
        compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <Truck className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
      <span>Pequeno Frete · Utilitário</span>
    </span>
  );
}

export function EvBadge({
  compact = false,
  propulsion,
}: {
  compact?: boolean;
  propulsion?: PropulsionType;
}) {
  const isHumanBike = propulsion === 'Propulsão Humana (Convencional)';
  const isEBike = propulsion === 'Elétrica / Pedal Assistido (E-Bike)';

  const label = isHumanBike
    ? 'Bike · -50% Taxa'
    : isEBike
    ? 'E-Bike · -50% Taxa'
    : 'Elétrico · -50% Taxa';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 font-medium text-emerald-800 whitespace-nowrap shrink-0 ${
        compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
    >
      {isHumanBike ? (
        <Bike className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
      ) : (
        <Zap className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

export function PropulsionTag({
  propulsion,
  vehicleType,
}: {
  propulsion?: PropulsionType;
  vehicleType?: VehicleType;
}) {
  if (!propulsion && vehicleType !== 'Bike') return null;
  if (hasCleanMobilityDiscount(propulsion, vehicleType)) {
    return (
      <EvBadge
        compact
        propulsion={
          propulsion ||
          (vehicleType === 'Bike'
            ? 'Propulsão Humana (Convencional)'
            : undefined)
        }
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 whitespace-nowrap shrink-0">
      <Fuel className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
      <span>Combustão</span>
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  if (status === 'Aguardando') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
        <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
        <span>Aguardando</span>
      </span>
    );
  }
  if (status === 'Em Rota') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 whitespace-nowrap shrink-0">
        <Truck className="h-3.5 w-3.5 text-sky-600 shrink-0" aria-hidden="true" />
        <span>Em Rota</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 whitespace-nowrap shrink-0">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
      <span>Entregue</span>
    </span>
  );
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  if (status === 'Aprovado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 whitespace-nowrap shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Aprovado</span>
      </span>
    );
  }
  if (status === 'Bloqueado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 whitespace-nowrap shrink-0">
        <ShieldAlert className="h-3.5 w-3.5 text-red-600 shrink-0" aria-hidden="true" />
        <span>Bloqueado</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
      <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
      <span>Aguardando Aprovação</span>
    </span>
  );
}

export function PaymentStatusBadge({
  status,
  compact = false,
}: {
  status?: PaymentStatus;
  compact?: boolean;
}) {
  const pad = compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  if (status === 'repassado') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 font-semibold text-emerald-800 whitespace-nowrap shrink-0 ${pad}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Repassado</span>
      </span>
    );
  }

  if (status === 'pago_lojista') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 font-semibold text-sky-800 whitespace-nowrap shrink-0 ${pad}`}
      >
        <QrCode className="h-3.5 w-3.5 text-sky-600 shrink-0" aria-hidden="true" />
        <span>Pix Confirmado (Lojista)</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 font-semibold text-amber-800 whitespace-nowrap shrink-0 ${pad}`}
    >
      <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
      <span>Aguardando Pix</span>
    </span>
  );
}
