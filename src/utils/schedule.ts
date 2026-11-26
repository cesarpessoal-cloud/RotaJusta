import { PickupSchedule } from '../types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toLocalDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

export function getTomorrowDateInputValue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateInputValue(d);
}

export function getTodayDateInputValue(): string {
  return toLocalDateInputValue(new Date());
}

function formatDayWord(datePart: string): string {
  const today = getTodayDateInputValue();
  const tomorrow = getTomorrowDateInputValue();
  if (datePart === today) return 'Hoje';
  if (datePart === tomorrow) return 'Amanhã';
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return datePart;
}

export function splitLocalDateTime(isoLocal?: string): {
  date: string;
  time: string;
} {
  if (!isoLocal || !isoLocal.includes('T')) {
    return { date: '', time: '' };
  }
  const [date, rawTime] = isoLocal.split('T');
  return {
    date: date || '',
    time: (rawTime || '').slice(0, 5),
  };
}

export function formatPickupScheduleLabel(
  schedule?: PickupSchedule
): string | null {
  if (!schedule) return null;

  if (schedule.mode === 'imediata') {
    if (schedule.deadlineAt) {
      const dl = splitLocalDateTime(schedule.deadlineAt);
      if (dl.date && dl.time) {
        const today = getTodayDateInputValue();
        const dayPrefix =
          dl.date === today ? '' : `${formatDayWord(dl.date)} `;
        return `Retirada imediata (Hoje) • Prazo até ${dayPrefix}${dl.time}`;
      }
    }
    return null;
  }

  const ready = splitLocalDateTime(schedule.readyAt);
  const deadline = splitLocalDateTime(schedule.deadlineAt);

  if (!ready.date || !ready.time) {
    return 'Coleta agendada';
  }

  const readyDay = formatDayWord(ready.date);
  let text = `Coleta agendada: ${readyDay} a partir das ${ready.time}`;

  if (deadline.date && deadline.time) {
    if (deadline.date === ready.date) {
      text += ` • Prazo até ${deadline.time}`;
    } else {
      text += ` • Prazo até ${formatDayWord(deadline.date)} às ${deadline.time}`;
    }
  }

  return text;
}
