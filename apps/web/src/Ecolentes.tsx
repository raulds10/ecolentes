import { useEffect, useState } from 'react';
import {
  api,
  daysSince,
  formatDate,
  formatDni,
  HOLD_LABELS,
  seesIdentityInReports,
  STAGE_LABELS,
  type CaseStage,
  type CaseSummary,
  type Role,
} from './lib/api';

const STAGE_ORDER: CaseStage[] = [
  'REQUEST',
  'ASSESSMENT',
  'OPTICIAN_QUOTE',
  'APPROVAL',
  'PRODUCTION',
  'RECEIVED',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'CLOSED',
];

type SortKey = 'code' | 'person' | 'neighborhood' | 'stage' | 'delivery';

type Lens = {
  key: string;
  code: string | null;
  kind: 'LEJOS' | 'CERCA' | null;
  deliveredAt: string | null;
  caseId: string;
  caseCode: string;
  stage: CaseStage;
  hold: CaseSummary['hold'];
  overdue: boolean;
  stageSince: string;
  personName: string;
  dni: string;
  neighborhood: string | null;
};

export function Ecolentes({ role, onOpen }: { role: Role; onOpen: (caseId: string) => void }) {
  const nominal = seesIdentityInReports(role);
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [stage, setStage] = useState<CaseStage | ''>('');
  const [delivery, setDelivery] = useState<'all' | 'yes' | 'no'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listCases({ take: 200 })
      .then((found) => {
        if (!cancelled) setCases(found);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lenses = (cases ?? []).flatMap(toLenses);
  const neighborhoods = [...new Set(lenses.map((lens) => lens.neighborhood).filter(Boolean))].sort(
    (a, b) => a!.localeCompare(b!, 'es'),
  ) as string[];
  const visible = sortLenses(
    lenses.filter((lens) => matches(lens, { q, neighborhood, stage, delivery })),
    sort,
  );
  const filtersOn = Boolean(q || neighborhood || stage || delivery !== 'all');

  return (
    <div className="stack">
      <header className="page-head">
        <h2>Ecolentes</h2>
        <p className="muted">
          {nominal
            ? 'Cada anteojo, con la persona a la que le corresponde, el barrio y si ya se entregó.'
            : 'Cada anteojo, con su barrio, la etapa del expediente y si ya se entregó.'}
        </p>
      </header>

      <div className="card filters">
        <div className="filter-grid">
          <label>
            Buscar
            <input
              value={q}
              placeholder="Código, expediente, apellido o DNI"
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label>
            Barrio
            <select value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
              <option value="">Todos</option>
              {neighborhoods.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Etapa del expediente
            <select value={stage} onChange={(e) => setStage(e.target.value as CaseStage | '')}>
              <option value="">Todas</option>
              {STAGE_ORDER.map((item) => (
                <option key={item} value={item}>
                  {STAGE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entrega
            <select
              value={delivery}
              onChange={(e) => setDelivery(e.target.value as 'all' | 'yes' | 'no')}
            >
              <option value="all">Todos</option>
              <option value="no">Sin entregar</option>
              <option value="yes">Entregados</option>
            </select>
          </label>
        </div>
        <div className="row between">
          {filtersOn && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setQ('');
                setNeighborhood('');
                setStage('');
                setDelivery('all');
              }}
            >
              Limpiar filtros
            </button>
          )}
          {cases && (
            <p className="muted count-line">
              {visible.length === 1 ? '1 ecolente' : `${visible.length} ecolentes`}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {cases === null && !error && (
        <p className="muted" role="status">
          Cargando ecolentes…
        </p>
      )}
      {cases && visible.length === 0 && (
        <p className="muted" role="status">
          No hay ecolentes que coincidan con lo que buscaste.
        </p>
      )}

      {visible.length > 0 && (
        <div className="card table-wrap">
          <table className="cases ecolentes">
            <caption className="sr-only">Estado de cada ecolente</caption>
            <thead>
              <tr>
                <SortHead label="Ecolente" column="code" sort={sort} onSort={setSort} />
                <th>Tipo</th>
                <SortHead label="Entrega" column="delivery" sort={sort} onSort={setSort} />
                <SortHead label="Etapa" column="stage" sort={sort} onSort={setSort} />
                {nominal && <SortHead label="Pertenece a" column="person" sort={sort} onSort={setSort} />}
                {nominal && <th>DNI</th>}
                <SortHead label="Barrio" column="neighborhood" sort={sort} onSort={setSort} />
                <th>Expediente</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lens) => (
                <tr
                  key={lens.key}
                  className="clickable"
                  tabIndex={0}
                  onClick={() => onOpen(lens.caseId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpen(lens.caseId);
                    }
                  }}
                >
                  <td data-label="Ecolente">
                    {lens.code ? (
                      <strong className="code">{lens.code}</strong>
                    ) : (
                      <span className="muted">Sin código</span>
                    )}
                  </td>
                  <td data-label="Tipo">
                    {lens.kind === 'CERCA' ? 'Cerca' : lens.kind === 'LEJOS' ? 'Lejos' : '—'}
                  </td>
                  <td data-label="Entrega">
                    {lens.deliveredAt ? (
                      <span className="chip stage">Entregado el {formatDate(lens.deliveredAt)}</span>
                    ) : (
                      <span className="chip">Sin entregar</span>
                    )}
                  </td>
                  <td data-label="Etapa">
                    <span className="chip">{STAGE_LABELS[lens.stage]}</span>
                    {lens.hold && <span className="chip hold">{HOLD_LABELS[lens.hold]}</span>}
                    <span className={lens.overdue ? 'days late' : 'days'}>
                      {daysSince(lens.stageSince) <= 0
                        ? 'Hoy'
                        : daysSince(lens.stageSince) === 1
                          ? '1 día'
                          : `${daysSince(lens.stageSince)} días`}
                    </span>
                  </td>
                  {nominal && (
                    <td data-label="Pertenece a">
                      <strong>{lens.personName}</strong>
                    </td>
                  )}
                  {nominal && <td data-label="DNI">{formatDni(lens.dni)}</td>}
                  <td data-label="Barrio">
                    {lens.neighborhood ?? <span className="muted">Sin barrio</span>}
                  </td>
                  <td data-label="Expediente">
                    <span className="code">{lens.caseCode}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

function toLenses(item: CaseSummary): Lens[] {
  const base = {
    caseId: item.id,
    caseCode: item.code,
    stage: item.stage,
    hold: item.hold,
    overdue: item.overdue,
    stageSince: item.stageSince,
    personName: `${item.person.lastName}, ${item.person.firstName}`,
    dni: item.person.dni,
    neighborhood: item.person.neighborhood,
  };
  if (item.glasses.length === 0) {
    return [{ ...base, key: item.id, code: null, kind: null, deliveredAt: null }];
  }
  return item.glasses.map((pair) => ({
    ...base,
    key: pair.code,
    code: pair.code,
    kind: pair.kind,
    deliveredAt: pair.deliveredAt,
  }));
}

function matches(
  lens: Lens,
  filter: { q: string; neighborhood: string; stage: CaseStage | ''; delivery: 'all' | 'yes' | 'no' },
) {
  if (filter.neighborhood && lens.neighborhood !== filter.neighborhood) return false;
  if (filter.stage && lens.stage !== filter.stage) return false;
  if (filter.delivery === 'yes' && !lens.deliveredAt) return false;
  if (filter.delivery === 'no' && lens.deliveredAt) return false;
  const text = fold(filter.q.trim());
  if (!text) return true;
  const digits = text.replace(/\D/g, '');
  const haystack = fold(
    [lens.code, lens.caseCode, lens.personName, lens.neighborhood].filter(Boolean).join(' '),
  );
  return haystack.includes(text) || (digits.length >= 3 && lens.dni.includes(digits));
}

function sortLenses(items: Lens[], sort: { key: SortKey; dir: 'asc' | 'desc' } | null) {
  if (!sort) return items;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
    return String(left).localeCompare(String(right), 'es') * dir;
  });
}

function sortValue(lens: Lens, key: SortKey): string | number {
  if (key === 'code') return lens.code ?? '';
  if (key === 'person') return lens.personName;
  if (key === 'neighborhood') return lens.neighborhood ?? '';
  if (key === 'stage') return STAGE_ORDER.indexOf(lens.stage);
  return lens.deliveredAt ?? '';
}

function SortHead({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' } | null;
  onSort: (next: { key: SortKey; dir: 'asc' | 'desc' } | null) => void;
}) {
  const active = sort?.key === column;
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="sort"
        onClick={() => {
          if (!active) onSort({ key: column, dir: 'asc' });
          else if (sort.dir === 'asc') onSort({ key: column, dir: 'desc' });
          else onSort(null);
        }}
      >
        {label}
        {active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}
