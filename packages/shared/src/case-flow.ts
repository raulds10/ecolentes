import type { CaseStage } from './case-stages.js';
import type { Role } from './roles.js';

/**
 * Quién puede dejar cada etapa y hacia dónde. Es el circuito confirmado con
 * Salud el 2026-10-08: la óptica recibe el expediente y propone cristales y
 * armazón, y Dirección aprueba antes de que se fabrique.
 */
export const STAGE_RULES: Record<
  CaseStage,
  { next: CaseStage[]; movedBy: Role[]; dueDays: number | null }
> = {
  REQUEST: { next: ['ASSESSMENT'], movedBy: ['OPERATOR', 'ADMIN'], dueDays: 7 },
  ASSESSMENT: { next: ['OPTICIAN_QUOTE'], movedBy: ['OPHTHALMOLOGIST', 'ADMIN'], dueDays: 15 },
  OPTICIAN_QUOTE: { next: ['APPROVAL'], movedBy: ['OPTICIAN', 'ADMIN'], dueDays: 5 },
  // Dirección aprueba y manda a producción, u observa y vuelve a la óptica.
  APPROVAL: { next: ['PRODUCTION', 'OPTICIAN_QUOTE'], movedBy: ['DIRECTOR', 'ADMIN'], dueDays: 3 },
  PRODUCTION: { next: ['RECEIVED'], movedBy: ['OPTICIAN', 'ADMIN'], dueDays: 15 },
  RECEIVED: { next: ['READY_FOR_PICKUP'], movedBy: ['OPERATOR', 'ADMIN'], dueDays: 3 },
  READY_FOR_PICKUP: { next: ['DELIVERED'], movedBy: ['OPERATOR', 'ADMIN'], dueDays: 10 },
  DELIVERED: { next: ['CLOSED'], movedBy: ['OPERATOR', 'ADMIN'], dueDays: 30 },
  CLOSED: { next: [], movedBy: [], dueDays: null },
};

export function canMove(from: CaseStage, to: CaseStage, role: Role): boolean {
  const rule = STAGE_RULES[from];
  return rule.next.includes(to) && rule.movedBy.includes(role);
}

/** Días de plazo de la etapa, para marcar las demoras en la bandeja. */
export function isOverdue(stage: CaseStage, since: Date, now: Date = new Date()): boolean {
  const dueDays = STAGE_RULES[stage].dueDays;
  if (dueDays === null) return false;
  const days = (now.getTime() - since.getTime()) / 86_400_000;
  return days > dueDays;
}

/**
 * Motivos por los que un expediente queda frenado. Ninguno lo cierra: la
 * persona sigue esperando sus anteojos y el caso tiene que seguir a la vista.
 */
export const CASE_HOLDS = {
  MISSING_DOCUMENTS: 'Falta documentación',
  QUOTE_OBSERVED: 'Presupuesto observado',
  REJECTED: 'Rechazado',
  DELAYED: 'Demorado',
  NOT_LOCATED: 'No se pudo ubicar a la persona',
  WITHDRAWN: 'Desistió',
  COMPLAINT: 'Reclamo',
} as const;

export type CaseHold = keyof typeof CASE_HOLDS;
