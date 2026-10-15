/**
 * La evolución de entregas y del stock por entregar, semana a semana o mes a
 * mes. La calcula la API y también la demostración del navegador, así que los
 * cortes viven acá: si cambian en un lado, cambian en los dos.
 */

export type EvolutionPeriod = 'semana' | 'mes';

export const EVOLUTION_PERIODS: EvolutionPeriod[] = ['semana', 'mes'];

/** Cuántos períodos se muestran hacia atrás, contando el que está en curso. */
export const EVOLUTION_BUCKETS = 12;

/** Etapas en las que los anteojos están en el municipio esperando entrega. */
const IN_HOUSE = ['RECEIVED', 'READY_FOR_PICKUP'];

/**
 * Tucumán está en UTC-3 todo el año. Las semanas y los meses se cortan a la
 * medianoche de acá, no a la del servidor: una entrega del domingo a las 22
 * es de esa semana, aunque en UTC ya sea lunes.
 */
const OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

export type EvolutionCase = {
  /** Los pares que cuenta la entrega, como en el padrón de entregas. */
  pairs: number;
  /** Los pares que ocupan lugar en la caja: los anteojos numerados, o `pairs`. */
  stockPairs: number;
  deliveredAt: Date | string | null;
  /** Los cambios de etapa del expediente; el orden no importa. */
  events: { toStage: string | null; occurredAt: Date | string }[];
};

export type EvolutionBucket = {
  /** Inicio del período (medianoche del lunes o del día 1, hora de Tucumán). */
  start: string;
  /** Fin del período, o ahora si es el que está en curso. */
  end: string;
  current: boolean;
  deliveries: number;
  deliveredPairs: number;
  /** Pares que llegaron al municipio en el período. */
  arrivedPairs: number;
  /** Pares que quedaban en el municipio sin entregar al cierre del período. */
  stockPairs: number;
};

export type Evolution = { period: EvolutionPeriod; buckets: EvolutionBucket[] };

export function isEvolutionPeriod(value: unknown): value is EvolutionPeriod {
  return value === 'semana' || value === 'mes';
}

/** Desde cuándo hay que traer datos para armar la serie. */
export function evolutionSince(period: EvolutionPeriod, now: Date = new Date()): Date {
  return new Date(periodStarts(period, now)[0]!);
}

export function buildEvolution(
  period: EvolutionPeriod,
  cases: EvolutionCase[],
  now: Date = new Date(),
): Evolution {
  const starts = periodStarts(period, now);
  const nowMs = now.getTime();
  const tracked = cases.map((c) => ({ ...c, deliveredMs: ms(c.deliveredAt), stays: inHouseStays(c) }));

  const buckets = starts.map((start, i) => {
    const next = starts[i + 1] ?? nextStart(period, start);
    const current = next > nowMs;
    const end = current ? nowMs : next;
    const inRange = (t: number | null) => t !== null && t >= start && t < next;

    const delivered = tracked.filter((c) => inRange(c.deliveredMs));
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      current,
      deliveries: delivered.length,
      deliveredPairs: sum(delivered.map((c) => c.pairs)),
      // Se cuenta la primera llegada: si un anteojo volvió a la óptica y llegó
      // de nuevo, sigue siendo el mismo par.
      arrivedPairs: sum(tracked.filter((c) => inRange(c.stays[0]?.from ?? null)).map((c) => c.stockPairs)),
      stockPairs: sum(
        tracked
          .filter((c) => c.stays.some((s) => s.from < end && (s.to === null || s.to >= end)))
          .map((c) => c.stockPairs),
      ),
    };
  });

  return { period, buckets };
}

/**
 * Los tramos en que el expediente estuvo en el municipio. Se arman con los
 * cambios de etapa; si la entrega quedó registrada sin el cambio de etapa, la
 * entrega cierra el tramo igual.
 */
function inHouseStays(c: EvolutionCase): { from: number; to: number | null }[] {
  const moves = c.events
    .filter((e) => e.toStage !== null)
    .map((e) => ({ stage: e.toStage!, at: ms(e.occurredAt)! }))
    .sort((a, b) => a.at - b.at);

  const stays: { from: number; to: number | null }[] = [];
  let open: { from: number; to: number | null } | null = null;
  for (const move of moves) {
    const inside = IN_HOUSE.includes(move.stage);
    if (inside && !open) {
      open = { from: move.at, to: null };
      stays.push(open);
    } else if (!inside && open) {
      open.to = move.at;
      open = null;
    }
  }
  const delivered = ms(c.deliveredAt);
  if (open && delivered !== null && delivered >= open.from) open.to = delivered;
  return stays;
}

/** Los inicios de los últimos EVOLUTION_BUCKETS períodos, el más viejo primero. */
function periodStarts(period: EvolutionPeriod, now: Date): number[] {
  const local = new Date(now.getTime() - OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const starts: number[] = [];
  for (let back = EVOLUTION_BUCKETS - 1; back >= 0; back--) {
    if (period === 'mes') {
      starts.push(Date.UTC(y, m - back, 1) + OFFSET_MS);
    } else {
      const sinceMonday = (local.getUTCDay() + 6) % 7;
      starts.push(Date.UTC(y, m, d - sinceMonday) + OFFSET_MS - back * 7 * DAY_MS);
    }
  }
  return starts;
}

function nextStart(period: EvolutionPeriod, start: number): number {
  if (period === 'semana') return start + 7 * DAY_MS;
  const local = new Date(start - OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) + OFFSET_MS;
}

function ms(value: Date | string | null): number | null {
  if (value === null) return null;
  return (typeof value === 'string' ? new Date(value) : value).getTime();
}

function sum(list: number[]): number {
  return list.reduce((acc, n) => acc + n, 0);
}
