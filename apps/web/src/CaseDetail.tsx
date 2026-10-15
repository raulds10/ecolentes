import { useCallback, useEffect, useState } from 'react';
import { ageOf, isMinor } from '@ecolentes/shared';
import {
  api,
  CHANNEL_LABELS,
  daysSince,
  formatDate,
  formatDni,
  HOLD_LABELS,
  STAGE_LABELS,
  type CaseDetail as Detail,
  type Role,
} from './lib/api';
import { CaseActions } from './CaseActions';
import { CasePhotos } from './CasePhotos';

const OPTICA_WORK = new Set(['PRODUCTION']);
const CLIENT_DELIVERY = new Set(['READY_FOR_PICKUP', 'DELIVERED', 'CLOSED']);

export function CaseDetail({
  id,
  role,
  backLabel,
  onBack,
  onOpenPerson,
}: {
  id: string;
  role: Role;
  backLabel: string;
  onBack: () => void;
  onOpenPerson: (personId: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .case(id)
      .then(setDetail)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="stack">
        <Back link={backLabel} onBack={onBack} />
        <p className="form-error" role="alert">{error}</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="stack">
        <Back link={backLabel} onBack={onBack} />
        <p className="muted" role="status">Abriendo el expediente…</p>
      </div>
    );
  }

  const p = detail.person;
  // La óptica no tiene por qué ver quién es la persona.
  const hidePerson = role === 'OPTICIAN';
  const age = hidePerson ? null : ageOf(p);
  const menor = hidePerson ? null : isMinor(p);
  const delivered = detail.glasses.filter((pair) => pair.deliveredAt).length;
  const events = [...detail.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <div className="stack">
      <Back link={backLabel} onBack={onBack} />

      <header className="page-head">
        <h2>{detail.code}</h2>
        <p className="case-who">
          {hidePerson ? (
            <span className="masked">
              {p.firstName[0]}
              {p.lastName[0]} · la óptica ve sólo las iniciales
            </span>
          ) : (
            <>
              {p.lastName}, {p.firstName} · DNI {formatDni(p.dni)}
              {age !== null ? ` · ${age} años` : ''}
              {menor === true ? ' · menor de edad' : ''}
            </>
          )}
        </p>
        {!hidePerson && (
          <button type="button" className="link" onClick={() => onOpenPerson(p.id)}>
            Ver la ficha
          </button>
        )}
      </header>

      <article className="card case-brief">
        <div className="case-status">
          <div>
            {OPTICA_WORK.has(detail.stage) && <p className="stage-owner">Óptica</p>}
            {CLIENT_DELIVERY.has(detail.stage) && <p className="stage-owner">Entrega al cliente</p>}
            <h3>{STAGE_LABELS[detail.stage]}</h3>
            <p className={detail.overdue ? 'stage-time late' : 'stage-time'}>
              {stageStay(detail.stageSince)}
            </p>
            <p className="stage-since">desde el {formatDate(detail.stageSince)}</p>
          </div>
          {detail.overdue && <span className="chip hold">Pasó el plazo</span>}
        </div>

        {detail.hold && (
          <p className="hold-note">
            <strong>{HOLD_LABELS[detail.hold]}.</strong> {detail.holdNote}
          </p>
        )}

        <dl className="fact-grid case-facts">
          {!hidePerson && (
            <>
              <div>
                <dt>Contacto</dt>
                <dd>
                  {p.phone ? (
                    <a href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a>
                  ) : (
                    <span className="muted">Sin teléfono</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Barrio</dt>
                <dd>{p.neighborhood ?? <span className="muted">Sin dato</span>}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Llegó por</dt>
            <dd>{CHANNEL_LABELS[detail.channel]}</dd>
          </div>
          {!hidePerson && (
            <div>
              <dt>Óptica</dt>
              <dd>{detail.optician?.name ?? <span className="muted">Sin asignar</span>}</dd>
            </div>
          )}
          <div>
            <dt>Pares</dt>
            <dd>
              {delivered} de {detail.pairs} {detail.pairs === 1 ? 'par entregado' : 'pares entregados'}
            </dd>
          </div>
        </dl>
        {detail.reason && (
          <div className="reason">
            <p>Para qué los pidió</p>
            <p>{detail.reason}</p>
          </div>
        )}
      </article>

      <CaseActions detail={detail} role={role} onDone={load} />

      {detail.glasses.length > 0 && (
        <article className="card">
          <h3>Anteojos</h3>
          <p className="muted">
            Cada par tiene su propio código. Es el que se le dicta a la persona, y con el que se
            puede buscar en la bandeja.
          </p>
          <ul className="glasses">
            {detail.glasses.map((pair) => (
              <li key={pair.code}>
                <strong className="mono">{pair.code}</strong>
                <span>{pair.kind === 'CERCA' ? 'Cerca' : 'Lejos'}</span>
                <span className={pair.deliveredAt ? 'chip stage' : 'muted'}>
                  {pair.deliveredAt
                    ? `Entregado el ${formatDate(pair.deliveredAt)}`
                    : 'Todavía no se entregó'}
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}

      {detail.prescription && (
        <article className="card">
          <h3>Receta</h3>
          <p className="mono">{detail.prescription.rawText}</p>
          <dl className="fact-grid flush">
            <div>
              <dt>Ojo derecho</dt>
              <dd>{eye(detail.prescription.farRightSphere, detail.prescription.farRightCylinder, detail.prescription.farRightAxis)}</dd>
            </div>
            <div>
              <dt>Ojo izquierdo</dt>
              <dd>{eye(detail.prescription.farLeftSphere, detail.prescription.farLeftCylinder, detail.prescription.farLeftAxis)}</dd>
            </div>
            <div>
              <dt>Cerca</dt>
              <dd>
              {detail.prescription.nearAddition != null ? (
                `ADD ${detail.prescription.nearAddition}`
              ) : (
                <span className="muted">Sin adición</span>
              )}
              </dd>
            </div>
          </dl>
          <p>
            {detail.prescription.validatedAt ? (
              <span className="chip stage">Validada por el profesional</span>
            ) : (
              <span className="chip hold">Falta que la valide el profesional</span>
            )}
          </p>
        </article>
      )}

      <CasePhotos detail={detail} role={role} onChange={load} />

      {(detail.quotes.length > 0 ||
        detail.stage === 'OPTICIAN_QUOTE' ||
        detail.stage === 'APPROVAL') && (
        <article className="card">
          <h3>{detail.stage === 'OPTICIAN_QUOTE' ? 'Pedido de compra' : 'Orden de compra'}</h3>
          <p className="muted">
            {detail.stage === 'OPTICIAN_QUOTE'
              ? `El presupuesto lo genera ${detail.optician?.name ?? 'la óptica'}. Con ese presupuesto se arma la orden de compra.`
              : `Esto es lo que se aprueba. El presupuesto lo generó ${detail.optician?.name ?? 'la óptica'}.`}
          </p>
          {detail.quotes.length === 0 ? (
            <p>Todavía no hay presupuesto.</p>
          ) : (
          <ul className="quotes">
            {[...detail.quotes]
              .sort((a, b) => b.version - a.version)
              .map((q) => (
              <li key={q.id} className={q.status === 'OBSERVED' ? 'observed' : ''}>
                <div className="quote-head">
                  <strong>
                    Presupuesto de {detail.optician?.name ?? 'la óptica'}
                  </strong>
                  <span className="chip">{QUOTE_LABELS[q.status]}</span>
                </div>
                <span className="budget-amount">
                  {q.amount != null ? money(q.amount) : 'Sin monto'}
                </span>
                <span>
                  Versión {q.version} · {q.lenses} · {q.frame}
                  {q.leadDays != null ? ` · ${q.leadDays} días` : ''}
                </span>
                {q.decisionNote && <span className="muted">{q.decisionNote}</span>}
              </li>
            ))}
          </ul>
          )}
        </article>
      )}

      {detail.delivery && (
        <article className="card">
          <h3>Entrega</h3>
          <p>
            {formatDate(detail.delivery.deliveredAt)} · retiró{' '}
            {detail.delivery.receivedBy}
            {detail.delivery.isRepresentative
              ? ` (${detail.delivery.receivedByDni ? `DNI ${formatDni(detail.delivery.receivedByDni)}` : 'representante'})`
              : ''}
          </p>
          {detail.delivery.note && <p className="muted">{detail.delivery.note}</p>}
        </article>
      )}

      <article className="card">
        <h3>Historial</h3>
        {events.length === 0 ? (
          <p className="muted">Todavía no hay movimientos.</p>
        ) : (
        <ul className="history">
          {events.map((e) => (
            <li key={e.id}>
              <span className="when">
                {new Date(e.occurredAt).toLocaleString('es-AR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
              <span>
                {e.fromStage && e.toStage
                  ? `${STAGE_LABELS[e.fromStage]} → ${STAGE_LABELS[e.toStage]}`
                  : e.hold
                    ? HOLD_LABELS[e.hold]
                    : (e.note ?? 'Movimiento registrado')}
              </span>
              <span className="muted">
                {e.username ?? 'sistema'}
                {e.fromStage && e.note ? ` · ${e.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
        )}
      </article>
    </div>
  );
}

const QUOTE_LABELS = {
  SUBMITTED: 'Esperando aprobación',
  APPROVED: 'Aprobada',
  OBSERVED: 'Observada',
} as const;

function Back({ link, onBack }: { link: string; onBack: () => void }) {
  return (
    <nav aria-label="Volver">
      <button type="button" className="link" onClick={onBack}>
        ← {link}
      </button>
    </nav>
  );
}

function stageStay(iso: string): string {
  const days = daysSince(iso);
  if (days <= 0) return 'Hoy en esta etapa';
  if (days === 1) return '1 día en esta etapa';
  return `${days} días en esta etapa`;
}

function money(amount: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function eye(sphere: string | null, cylinder: string | null, axis: number | null) {
  if (sphere === null && cylinder === null && axis === null) {
    return <span className="muted">No se pudo interpretar, mirá el texto de arriba</span>;
  }
  const parts = [
    axis !== null ? `eje ${axis}°` : null,
    sphere !== null ? `esf ${sphere}` : null,
    cylinder !== null ? `cil ${cylinder}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}
