import { useEffect, useState } from 'react';
import { seesAttachment } from '@ecolentes/shared';
import {
  api,
  daysSince,
  formatDni,
  HOLD_LABELS,
  STAGE_LABELS,
  type AuditEntry,
  type CaseSummary,
  type Person,
  type Role,
} from './lib/api';
import { SavedPhoto } from './PhotoField';

const ACTION_LABELS: Record<AuditEntry['action'], string> = {
  VIEW: 'Vio la ficha',
  CREATE: 'Creó la ficha',
  UPDATE: 'Modificó la ficha',
  LOGIN: 'Inició sesión',
  LOGIN_FAILED: 'Intento de ingreso fallido',
};

export function PersonDetail({
  id,
  role,
  onBack,
  onOpenCase,
}: {
  id: string;
  role: Role;
  onBack: () => void;
  onOpenCase: (id: string) => void;
}) {
  const [person, setPerson] = useState<Person | null>(null);
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSeeHistory = role === 'DIRECTOR' || role === 'ADMIN';

  useEffect(() => {
    api
      .person(id)
      .then((found) => {
        setPerson(found);
        // Los expedientes de la persona, para no tener que volver a buscarlos:
        // se piden por su DNI y se filtran por ficha, porque la búsqueda es
        // por texto y un DNI puede estar contenido en otro.
        return api
          .listCases({ q: found.dni })
          .then((list) => setCases(list.filter((c) => c.person.id === found.id)))
          .catch(() => setCases([]));
      })
      .catch((e: Error) => setError(e.message));
    if (canSeeHistory) {
      api.personHistory(id).then(setHistory).catch(() => setHistory([]));
    }
  }, [id, canSeeHistory]);

  if (error) return <p className="error">{error}</p>;
  if (!person) return <p className="muted">Abriendo la ficha…</p>;

  const canSeeDni = seesAttachment(role, 'DNI_FRONT');
  const age = ageLabel(person);

  return (
    <div className="stack">
      <button type="button" className="link" onClick={onBack}>
        ← Volver a buscar
      </button>

      <article className="card person-sheet">
        <header className="person-head">
          {canSeeDni && (
            <div className="dni-frame">
              {person.dniFrontId ? (
                <SavedPhoto
                  label="DNI, frente"
                  load={() => api.attachment(person.dniFrontId!)}
                />
              ) : (
                <p className="muted">Sin foto del frente del DNI.</p>
              )}
            </div>
          )}
          <div className="person-identity">
            <h2>
              {person.lastName}, {person.firstName}
            </h2>
            <p className="dni">DNI {formatDni(person.dni)}</p>
            {age && <p className="person-age">{age}</p>}
          </div>
        </header>

        <dl className="fact-grid">
          <Fact label="Fecha de nacimiento" value={formatDate(person.birthDate)} />
          <Fact label="Edad" value={age} />
          <Fact label="Contacto" value={person.phone} />
          <Fact label="Barrio" value={person.neighborhood} />
          <Fact label="Domicilio" value={person.address} />
          <Fact label="Representante" value={representativeOf(person)} />
        </dl>
      </article>

      <article className="card">
        <h3>Anteojos y expedientes</h3>
        {cases === null && <p className="muted">Cargando…</p>}
        {cases?.length === 0 && (
          <p className="muted">Nunca pidió anteojos: esta ficha no tiene ningún expediente.</p>
        )}
        {cases && cases.length > 0 && (
          <ul className="person-cases">
            {cases.map((c) => {
              const days = daysSince(c.stageSince);
              return (
                <li key={c.id}>
                  <button type="button" className="person-case" onClick={() => onOpenCase(c.id)}>
                    <strong className="code">{c.code}</strong>
                    <span className="case-meta">
                      <span className="chip">{STAGE_LABELS[c.stage]}</span>
                      <span className={c.overdue ? 'days late' : 'days'}>
                        hace {days} {days === 1 ? 'día' : 'días'}
                      </span>
                      {c.hold && <span className="chip hold">{HOLD_LABELS[c.hold]}</span>}
                    </span>
                    <span className="pair-codes">
                      {c.glasses.length === 0 ? (
                        <span className="muted">
                          {c.pairs} {c.pairs === 1 ? 'par pedido' : 'pares pedidos'}, todavía sin
                          código
                        </span>
                      ) : (
                        c.glasses.map((pair) => (
                          <span key={pair.code}>
                            {pair.code}{' '}
                            <span className="muted">{pair.kind === 'CERCA' ? 'cerca' : 'lejos'}</span>
                            {pair.deliveredAt && <span className="muted"> · entregado</span>}
                          </span>
                        ))
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      {canSeeHistory && (
        <article className="card">
          <h3>Historial</h3>
          {history === null && <p className="muted">Cargando…</p>}
          {history?.length === 0 && <p className="muted">Todavía no hay movimientos.</p>}
          {history && history.length > 0 && (
            <ul className="history">
              {history.map((entry) => (
                <li key={entry.id}>
                  <span className="when">{formatDateTime(entry.occurredAt)}</span>
                  <span>
                    {ACTION_LABELS[entry.action]}
                    {entry.username ? ` · ${entry.username}` : ''}
                  </span>
                  {entry.changes && (
                    <span className="muted">{Object.keys(entry.changes).join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value === null || value === '' ? <span className="muted">Sin dato</span> : value}</dd>
    </div>
  );
}

function ageLabel(person: Person): string | null {
  if (person.birthDate) {
    const years = yearsSince(person.birthDate);
    return `${years} ${years === 1 ? 'año' : 'años'}`;
  }
  if (person.ageAtIntake != null) {
    return `${person.ageAtIntake} ${person.ageAtIntake === 1 ? 'año' : 'años'}, anotada en la atención`;
  }
  return null;
}

function representativeOf(person: Person): string | null {
  if (!person.representativeName) return null;
  return person.representativeBond
    ? `${person.representativeName} · ${person.representativeBond}`
    : person.representativeName;
}

function formatDate(value: string | null): string | null {
  return value ? new Date(value).toLocaleDateString('es-AR') : null;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function yearsSince(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) years -= 1;
  return years;
}
