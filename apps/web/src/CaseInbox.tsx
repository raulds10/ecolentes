import { useEffect, useRef, useState, type FormEvent } from 'react';
import { canMove, isMinor, STAGE_RULES } from '@ecolentes/shared';
import {
  api,
  daysSince,
  formatDate,
  formatDni,
  HOLD_LABELS,
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

const OPTICIAN_STAGES: CaseStage[] = ['OPTICIAN_QUOTE', 'APPROVAL', 'PRODUCTION'];
/** La óptica fabrica. El depósito recibe. Después empieza la entrega al cliente. */
const OPTICA_WORK: CaseStage[] = ['PRODUCTION'];
const CLIENT_DELIVERY: CaseStage[] = ['READY_FOR_PICKUP', 'DELIVERED', 'CLOSED'];

export function CaseInbox({
  onOpen,
  role,
  view,
  onView,
}: {
  onOpen: (id: string) => void;
  role: Role;
  view: 'table' | 'kanban';
  onView: (view: 'table' | 'kanban') => void;
}) {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [stage, setStage] = useState<CaseStage | ''>('');
  const [q, setQ] = useState('');
  const [personQ, setPersonQ] = useState('');
  const [codeQ, setCodeQ] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [onDate, setOnDate] = useState('');
  const [atTime, setAtTime] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ item: CaseSummary; to: CaseStage } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const params =
      view === 'kanban'
        ? { overdue, take: 200 }
        : { stage, q, overdue };
    api
      .listCases(params)
      .then((found) => {
        if (!cancelled) setCases(found);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [view, stage, q, overdue]);

  const delayed = cases?.filter((c) => c.overdue).length ?? 0;
  const visible = view === 'kanban' && cases
    ? cases.filter((c) => matchesKanban(c, { personQ, codeQ, neighborhood, onDate, atTime }))
    : cases;
  const neighborhoods = neighborhoodsOf(cases ?? []);
  const filtersOn = Boolean(personQ || codeQ || neighborhood || onDate || atTime || stage);
  const tableFiltersOn = Boolean(q || stage || overdue);
  const rows = visible && view === 'table' ? sortCases(visible, sort) : visible;

  return (
    <div className="stack">
      <header className="page-head">
        <h2>Expedientes</h2>
        <p className="muted">El circuito, de la solicitud a la entrega.</p>
      </header>

      {view === 'table' ? (
        <div className="card filters">
          <div className="filter-grid">
            <label>
              Buscar
              <input
                id="buscar"
                value={q}
                placeholder="Expediente, anteojo, apellido o DNI"
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label>
              Etapa
              <select
                id="etapa"
                value={stage}
                onChange={(e) => setStage(e.target.value as CaseStage | '')}
              >
                <option value="">Todas</option>
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row between">
            <OverdueToggle
              checked={overdue}
              delayed={delayed}
              onChange={setOverdue}
            />
            <div className="row">
              {tableFiltersOn && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setQ('');
                    setStage('');
                    setOverdue(false);
                  }}
                >
                  Limpiar filtros
                </button>
              )}
              {visible && (
                <p className="muted count-line">
                  {visible.length === 1 ? '1 expediente' : `${visible.length} expedientes`}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card filters">
          <div className="filter-grid">
            <label>
              Persona
              <input
                value={personQ}
                placeholder="Apellido o DNI"
                onChange={(e) => setPersonQ(e.target.value)}
              />
            </label>
            <label>
              Expediente
              <input
                value={codeQ}
                placeholder="ECO-0007 o ANT-0010"
                onChange={(e) => setCodeQ(e.target.value)}
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
              Circuito
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as CaseStage | '')}
              >
                <option value="">Todo el circuito</option>
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha en la etapa
              <input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} />
            </label>
            <label>
              Fecha y hora en la etapa
              <input
                type="datetime-local"
                value={atTime}
                onChange={(e) => setAtTime(e.target.value)}
              />
            </label>
          </div>
          <div className="row between">
            <OverdueToggle checked={overdue} delayed={delayed} onChange={setOverdue} />
            {filtersOn && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setPersonQ('');
                  setCodeQ('');
                  setNeighborhood('');
                  setOnDate('');
                  setAtTime('');
                  setStage('');
                  setOverdue(false);
                }}
              >
                Limpiar filtros
              </button>
            )}
            {visible && (
              <p className="muted count-line">
                {stage
                  ? `${visible.filter((c) => c.stage === stage).length} en ${STAGE_LABELS[stage]}`
                  : visible.length === 1
                    ? '1 en el tablero'
                    : `${visible.length} en el tablero`}
              </p>
            )}
          </div>
          {onDate && atTime && (
            <p className="field-hint">La fecha y la hora se cumplen juntas.</p>
          )}
        </div>
      )}

      <div className="tabs view-tabs" role="tablist" aria-label="Cómo ver los expedientes">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'table'}
          className={view === 'table' ? 'tab active' : 'tab'}
          onClick={() => onView('table')}
        >
          Tabla
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'kanban'}
          className={view === 'kanban' ? 'tab active' : 'tab'}
          onClick={() => onView('kanban')}
        >
          Kanban
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="form-ok" role="status">
          {notice}
        </p>
      )}
      {cases === null && !error && (
        <p className="muted" role="status">
          Cargando expedientes…
        </p>
      )}
      {visible?.length === 0 && (
        <p className="muted" role="status">
          No hay expedientes que coincidan con lo que buscaste.
        </p>
      )}

      {rows && rows.length > 0 && view === 'table' && (
        <div className="card table-wrap">
          <table className="cases">
            <caption className="sr-only">Expedientes del circuito</caption>
            <thead>
              <tr>
                <SortHead label="Expediente" column="code" sort={sort} onSort={setSort} />
                <SortHead label="Persona" column="person" sort={sort} onSort={setSort} />
                <th>DNI</th>
                <SortHead label="Barrio" column="neighborhood" sort={sort} onSort={setSort} />
                <th>Anteojos</th>
                <SortHead label="Etapa" column="stage" sort={sort} onSort={setSort} />
                <SortHead label="En la etapa" column="days" sort={sort} onSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const delivered = c.glasses.filter((pair) => pair.deliveredAt).length;
                return (
                  <tr
                    key={c.id}
                    className="clickable"
                    tabIndex={0}
                    onClick={() => onOpen(c.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpen(c.id);
                      }
                    }}
                  >
                    <td data-label="Expediente">
                      <span className="code">{c.code}</span>
                    </td>
                    <td data-label="Persona">
                      <strong>
                        {c.person.lastName}, {c.person.firstName}
                      </strong>
                    </td>
                    <td data-label="DNI">{formatDni(c.person.dni)}</td>
                    <td data-label="Barrio">
                      {c.person.neighborhood ?? <span className="muted">Sin barrio</span>}
                    </td>
                    <td data-label="Anteojos">
                      <span className="pair-codes">
                        {c.glasses.map((pair) => (
                          <span key={pair.code}>
                            {pair.code} ({pair.kind === 'CERCA' ? 'cerca' : 'lejos'})
                          </span>
                        ))}
                      </span>
                      <span className="muted">
                        {delivered} de {c.pairs} {c.pairs === 1 ? 'par' : 'pares'}
                      </span>
                    </td>
                    <td data-label="Etapa">
                      <span className="chip stage">{STAGE_LABELS[c.stage]}</span>
                      {c.hold && <span className="chip hold">{HOLD_LABELS[c.hold]}</span>}
                    </td>
                    <td data-label="En la etapa">
                      <span className={c.overdue ? 'days late' : 'days'}>{stayLabel(c.stageSince)}</span>
                      {c.overdue && <span className="chip hold">Pasó el plazo</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visible && visible.length > 0 && view === 'kanban' && (
        <SelectionBar
          picked={(visible ?? []).filter((c) => selected.has(c.id))}
          role={role}
          busy={movingId !== null}
          onMoveMany={(items, to) => void commitMany(items, to)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {visible && visible.length > 0 && view === 'kanban' && (
        <>
        {selected.size === 0 && (
          <p className="kanban-hint">
            Arrastrá una tarjeta a otra etapa, o marcá varias para moverlas juntas. Deslizá el tablero
            para ver el resto.
          </p>
        )}
        <Kanban
          cases={stage ? visible.filter((item) => item.stage === stage) : visible}
          stages={role === 'OPTICIAN' ? OPTICIAN_STAGES : STAGE_ORDER}
          focusStage={stage}
          role={role}
          movingId={movingId}
          selected={selected}
          onOpen={onOpen}
          onMove={requestMove}
          onMoveMany={(items, to) => void commitMany(items, to)}
          onToggle={toggleSelected}
          onToggleMany={toggleMany}
        />
        </>
      )}

      {pending && (
        <MoveDialog
          item={pending.item}
          to={pending.to}
          busy={movingId === pending.item.id}
          onCancel={() => setPending(null)}
          onCommit={(run, patch) => void commit(pending.item, pending.to, run, patch)}
        />
      )}
    </div>
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function requestMove(item: CaseSummary, to: CaseStage) {
    if (!canMove(item.stage, to, role) || movingId) return;
    if (needsDetails(item.stage, to)) {
      setPending({ item, to });
      return;
    }
    void commit(item, to, () => api.moveStage(item.id, to));
  }

  async function commit(
    item: CaseSummary,
    to: CaseStage,
    run: () => Promise<unknown>,
    patch?: { holdNote?: string | null },
  ) {
    setMovingId(item.id);
    setError(null);
    try {
      await run();
      setCases((prev) =>
        prev?.map((c) => (c.id === item.id ? landed(c, item.stage, to, patch?.holdNote) : c)) ?? prev,
      );
      setSelected((prev) => dropSelected(prev, [item.id]));
      setPending(null);
      setNotice(`${item.code} pasó a ${STAGE_LABELS[to]}.`);
      revealCase(item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mover el expediente');
    } finally {
      setMovingId(null);
    }
  }

  async function commitMany(items: CaseSummary[], to: CaseStage) {
    const movable = items.filter(
      (item) => canMove(item.stage, to, role) && !needsDetails(item.stage, to),
    );
    if (movable.length === 0 || movingId) return;
    setMovingId('varios');
    setError(null);
    const moved: string[] = [];
    const failed: string[] = [];
    for (const item of movable) {
      try {
        await api.moveStage(item.id, to);
        moved.push(item.id);
      } catch (e) {
        failed.push(
          `${item.code}: ${e instanceof Error ? e.message : 'no se pudo mover'}`,
        );
      }
    }
    if (moved.length > 0) {
      const from = new Map(movable.map((item) => [item.id, item.stage]));
      setCases((prev) =>
        prev?.map((c) => {
          const origin = from.get(c.id);
          return origin && moved.includes(c.id) ? landed(c, origin, to) : c;
        }) ?? prev,
      );
      setSelected((prev) => dropSelected(prev, moved));
      setNotice(
        moved.length === 1
          ? `${movable.find((item) => item.id === moved[0])?.code ?? '1 expediente'} pasó a ${STAGE_LABELS[to]}.`
          : `${moved.length} expedientes pasaron a ${STAGE_LABELS[to]}.`,
      );
      revealCase(moved[0]!);
    }
    if (failed.length > 0) setError(failed.join(' · '));
    setMovingId(null);
  }
}

function OverdueToggle({
  checked,
  delayed,
  onChange,
}: {
  checked: boolean;
  delayed: number;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Sólo los que pasaron el plazo
      {delayed > 0 && !checked && <span className="badge late">{delayed}</span>}
    </label>
  );
}

function matchesKanban(
  item: CaseSummary,
  filters: {
    personQ: string;
    codeQ: string;
    neighborhood: string;
    onDate: string;
    atTime: string;
  },
): boolean {
  const person = fold(filters.personQ);
  if (person) {
    const name = fold(`${item.person.lastName} ${item.person.firstName}`);
    const dni = item.person.dni.replace(/\D/g, '');
    const digits = person.replace(/\D/g, '');
    const byName = name.includes(person);
    const byDni = digits.length >= 3 && dni.includes(digits);
    if (!byName && !byDni) return false;
  }

  const code = fold(filters.codeQ);
  if (code) {
    const codes = [item.code, ...item.glasses.map((pair) => pair.code)].map(fold);
    if (!codes.some((value) => value.includes(code))) return false;
  }

  if (filters.neighborhood && item.person.neighborhood !== filters.neighborhood) return false;
  if (filters.onDate && localDay(item.stageSince) !== filters.onDate) return false;
  if (filters.atTime && localMinute(item.stageSince) !== filters.atTime) return false;
  return true;
}

function neighborhoodsOf(cases: CaseSummary[]): string[] {
  return [...new Set(cases.map((c) => c.person.neighborhood).filter((name): name is string => !!name))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localMinute(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDay(iso)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function whenInStage(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deliveredOf(item: CaseSummary): number {
  return item.glasses.filter((pair) => pair.deliveredAt).length;
}

function revealCase(id: string) {
  window.setTimeout(() => {
    document.querySelector(`[data-case="${id}"]`)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, 60);
}

function dropSelected(selected: ReadonlySet<string>, ids: string[]): ReadonlySet<string> {
  if (ids.every((id) => !selected.has(id))) return selected;
  const next = new Set(selected);
  for (const id of ids) next.delete(id);
  return next;
}

function SelectionBar({
  picked,
  role,
  busy,
  onMoveMany,
  onClear,
}: {
  picked: CaseSummary[];
  role: Role;
  busy: boolean;
  onMoveMany: (items: CaseSummary[], to: CaseStage) => void;
  onClear: () => void;
}) {
  if (picked.length === 0) return null;
  const destinations = bulkDestinations(picked, role);
  const blocked = picked.length - new Set(destinations.flatMap((d) => d.items.map((c) => c.id))).size;
  const count = picked.length === 1 ? '1 seleccionado' : `${picked.length} seleccionados`;

  return (
    <div className="selection-bar">
      <strong>{count}</strong>
      {destinations.map((destination) => (
        <button
          key={destination.to}
          type="button"
          disabled={busy}
          onClick={() => onMoveMany(destination.items, destination.to)}
        >
          {busy ? 'Moviendo…' : bulkCaption(destination.items, destination.to)}
        </button>
      ))}
      {destinations.length === 0 && (
        <span className="muted">Estos expedientes no se pueden pasar juntos de etapa.</span>
      )}
      {blocked > 0 && destinations.length > 0 && (
        <span className="muted">
          {blocked === 1 ? '1 queda donde está.' : `${blocked} quedan donde están.`}
        </span>
      )}
      <button type="button" className="link" onClick={onClear}>
        Quitar selección
      </button>
    </div>
  );
}

function ColumnSelect({
  ids,
  selected,
  label,
  onToggleMany,
}: {
  ids: string[];
  selected: ReadonlySet<string>;
  label: string;
  onToggleMany: (ids: string[], on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const all = ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !all;
  }, [some, all]);
  return (
    <label className="kanban-check" title="Seleccionar todos">
      <input
        ref={ref}
        className="kanban-select-all"
        type="checkbox"
        checked={all}
        aria-label={label}
        onChange={(event) => onToggleMany(ids, event.target.checked)}
      />
    </label>
  );
}

function Kanban({
  cases,
  stages,
  focusStage,
  role,
  movingId,
  selected,
  onOpen,
  onMove,
  onMoveMany,
  onToggle,
  onToggleMany,
}: {
  cases: CaseSummary[];
  stages: CaseStage[];
  focusStage: CaseStage | '';
  role: Role;
  movingId: string | null;
  selected: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onMove: (item: CaseSummary, to: CaseStage) => void;
  onMoveMany: (items: CaseSummary[], to: CaseStage) => void;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], on: boolean) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<CaseStage | null>(null);
  const skipClick = useRef(false);
  const dragging = cases.find((c) => c.id === draggingId) ?? null;
  const dragGroup = dragging
    ? selected.has(dragging.id)
      ? cases.filter((c) => selected.has(c.id))
      : [dragging]
    : [];
  const targets = dragTargets(dragGroup, role);

  return (
    <div className={draggingId ? 'kanban is-dragging' : 'kanban'} aria-label="Tablero del circuito">
      {stages.map((stage) => {
        const items = cases.filter((c) => c.stage === stage);
        const late = items.filter((c) => c.overdue).length;
        const accepts = targets.includes(stage);
        const columnClass = [
          'kanban-col',
          accepts ? 'drop-ok' : '',
          dragOver === stage ? 'drop-on' : '',
          focusStage === stage ? 'is-focus' : '',
          focusStage && focusStage !== stage ? 'is-quiet' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <section
            key={stage}
            className={`${columnClass}${OPTICA_WORK.includes(stage) ? ' is-optica' : ''}${CLIENT_DELIVERY.includes(stage) ? ' is-delivery' : ''}`}
            aria-label={STAGE_LABELS[stage]}
            onDragOver={(event) => {
              if (!accepts) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOver(stage);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain');
              const item = cases.find((c) => c.id === id);
              setDraggingId(null);
              setDragOver(null);
              if (!item) return;
              const group = selected.has(item.id)
                ? cases.filter((c) => selected.has(c.id))
                : [item];
              if (group.length > 1) {
                const direct = group.filter(
                  (c) => canMove(c.stage, stage, role) && !needsDetails(c.stage, stage),
                );
                if (direct.length > 0) onMoveMany(direct, stage);
                return;
              }
              if (canMove(item.stage, stage, role)) onMove(item, stage);
            }}
          >
            <header>
              {OPTICA_WORK.includes(stage) && <p className="kanban-owner">Óptica</p>}
              {CLIENT_DELIVERY.includes(stage) && <p className="kanban-owner">Entrega al cliente</p>}
              <div className="kanban-title">
                {items.length > 0 ? (
                  <ColumnSelect
                    ids={items.map((c) => c.id)}
                    selected={selected}
                    label={`Seleccionar todos en ${STAGE_LABELS[stage]}`}
                    onToggleMany={onToggleMany}
                  />
                ) : (
                  <span className="kanban-check" aria-hidden="true" />
                )}
                <h3>{STAGE_LABELS[stage]}</h3>
                <span className="kanban-count">{items.length}</span>
              </div>
              {late > 0 && (
                <p className="late-note">
                  {late === 1 ? '1 pasó el plazo' : `${late} pasaron el plazo`}
                </p>
              )}
            </header>
            <ol>
              {items.length === 0 && (accepts || !focusStage || focusStage === stage) && (
                <li>
                  <p className="muted">{accepts ? 'Soltá acá' : 'Sin expedientes'}</p>
                </li>
              )}
              {items.map((c) => {
                const moves = nextStages(c.stage, role);
                const draggable = moves.length > 0;
                const inDrag = dragGroup.some((item) => item.id === c.id);
                return (
                  <li key={c.id}>
                    <article
                      data-case={c.id}
                      className={[
                        'kanban-card',
                        c.overdue ? 'late' : '',
                        draggable ? 'draggable' : '',
                        selected.has(c.id) ? 'selected' : '',
                        inDrag ? 'dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="kanban-body">
                      <label className="kanban-check">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          aria-label={`Seleccionar ${c.code}`}
                          onChange={() => onToggle(c.id)}
                        />
                      </label>
                      <div
                        className="kanban-open"
                        role="button"
                        tabIndex={0}
                        draggable={draggable}
                        aria-label={`${c.code}, ${c.person.lastName}`}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          onOpen(c.id);
                        }}
                        onDragStart={(event) => {
                          if (!draggable) {
                            event.preventDefault();
                            return;
                          }
                          skipClick.current = true;
                          event.dataTransfer.setData('text/plain', c.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(c.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOver(null);
                          window.setTimeout(() => {
                            skipClick.current = false;
                          }, 0);
                        }}
                        onClick={() => {
                          if (skipClick.current) {
                            skipClick.current = false;
                            return;
                          }
                          onOpen(c.id);
                        }}
                      >
                        <span className="kanban-who">
                          <strong>
                            {c.person.lastName}, {c.person.firstName}
                          </strong>
                          <span className="code">{c.code}</span>
                        </span>
                        <span className="kanban-meta">
                          {c.person.neighborhood ?? 'Sin barrio'}
                          <span>DNI {formatDni(c.person.dni)}</span>
                        </span>
                        <span className={c.overdue ? 'kanban-stay late' : 'kanban-stay'}>
                          {cardStay(c.stageSince)}
                          <span>{cardSince(c.stageSince)}</span>
                        </span>
                        {(c.overdue || c.hold) && (
                          <span className="kanban-flags">
                            {c.overdue && <span className="chip hold">Pasó el plazo</span>}
                            {c.hold && <span className="chip">Freno: {HOLD_LABELS[c.hold]}</span>}
                          </span>
                        )}
                        {(c.stage === 'OPTICIAN_QUOTE' || c.stage === 'APPROVAL') && (
                          <BudgetLine item={c} />
                        )}
                        <span className="kanban-pairs">
                          {pairLine(c)}
                          {c.glasses.length > 0 && (
                            <span>{c.glasses.map((pair) => pair.code).join(' · ')}</span>
                          )}
                        </span>
                      </div>
                      </div>
                      {moves.length > 0 && (
                        <div className="kanban-moves">
                          {moves.map((to) => (
                            <button
                              key={to}
                              type="button"
                              className="secondary"
                              disabled={movingId !== null}
                              onClick={() => {
                                if (skipClick.current) {
                                  skipClick.current = false;
                                  return;
                                }
                                onMove(c, to);
                              }}
                            >
                              {movingId === c.id ? 'Moviendo…' : moveCaption(c.stage, to)}
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function nextStages(from: CaseStage, role: Role): CaseStage[] {
  return STAGE_RULES[from].next.filter((to) => canMove(from, to, role));
}

function dragTargets(group: CaseSummary[], role: Role): CaseStage[] {
  const multi = group.length > 1;
  const targets = new Set<CaseStage>();
  for (const item of group) {
    for (const to of nextStages(item.stage, role)) {
      if (multi && needsDetails(item.stage, to)) continue;
      targets.add(to);
    }
  }
  return [...targets];
}

function bulkDestinations(
  items: CaseSummary[],
  role: Role,
): { to: CaseStage; items: CaseSummary[] }[] {
  const groups = new Map<CaseStage, CaseSummary[]>();
  for (const item of items) {
    for (const to of nextStages(item.stage, role)) {
      if (needsDetails(item.stage, to)) continue;
      groups.set(to, [...(groups.get(to) ?? []), item]);
    }
  }
  return STAGE_ORDER.filter((stage) => groups.has(stage)).map((stage) => ({
    to: stage,
    items: groups.get(stage) ?? [],
  }));
}

function bulkCaption(items: CaseSummary[], to: CaseStage): string {
  const origins = new Set(items.map((item) => item.stage));
  const label =
    origins.size === 1
      ? moveCaption([...origins][0]!, to)
      : `Pasar a ${STAGE_LABELS[to]}`;
  return items.length === 1 ? label : `${label} (${items.length})`;
}

/** El paso pide datos: no alcanza con cambiar la etapa. */
function needsDetails(from: CaseStage, to: CaseStage): boolean {
  if (from === 'OPTICIAN_QUOTE' && to === 'APPROVAL') return true;
  if (from === 'APPROVAL') return true;
  if (from === 'READY_FOR_PICKUP' && to === 'DELIVERED') return true;
  return false;
}

function moveCaption(from: CaseStage, to: CaseStage): string {
  if (from === 'APPROVAL' && to === 'PRODUCTION') return 'Aprobar orden';
  if (from === 'APPROVAL' && to === 'OPTICIAN_QUOTE') return 'Observar';
  if (from === 'OPTICIAN_QUOTE' && to === 'APPROVAL') return 'Armar orden de compra';
  if (from === 'READY_FOR_PICKUP' && to === 'DELIVERED') return 'Registrar entrega';
  if (from === 'RECEIVED' && to === 'READY_FOR_PICKUP') return 'Listo para entregar';
  if (from === 'DELIVERED' && to === 'CLOSED') return 'Cerrar entrega';
  return `Pasar a ${STAGE_LABELS[to]}`;
}

function landed(
  item: CaseSummary,
  from: CaseStage,
  to: CaseStage,
  holdNote?: string | null,
): CaseSummary {
  const observed = from === 'APPROVAL' && to === 'OPTICIAN_QUOTE';
  return {
    ...item,
    stage: to,
    stageSince: new Date().toISOString(),
    overdue: false,
    hold: observed ? 'QUOTE_OBSERVED' : null,
    holdNote: observed ? holdNote ?? null : null,
  };
}

function MoveDialog({
  item,
  to,
  busy,
  onCancel,
  onCommit,
}: {
  item: CaseSummary;
  to: CaseStage;
  busy: boolean;
  onCancel: () => void;
  onCommit: (
    run: () => Promise<unknown>,
    patch?: { holdNote?: string | null },
  ) => void;
}) {
  const who = `${item.person.lastName}, ${item.person.firstName}`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const field = dialog?.querySelector<HTMLElement>('input:not([type="checkbox"]), textarea, select');
    const primary = dialog?.querySelector<HTMLElement>('.actions button:not(.secondary)');
    (field ?? primary)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mover-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h3 id="mover-titulo">
            {item.code} · {who}
          </h3>
          <button type="button" className="secondary" onClick={onCancel}>
            Cerrar
          </button>
        </div>
        {item.stage === 'OPTICIAN_QUOTE' && <QuoteFields busy={busy} onCancel={onCancel} onCommit={onCommit} caseId={item.id} />}
        {item.stage === 'APPROVAL' && to === 'PRODUCTION' && (
          <ApproveFields busy={busy} onCancel={onCancel} onCommit={onCommit} caseId={item.id} />
        )}
        {item.stage === 'APPROVAL' && to === 'OPTICIAN_QUOTE' && (
          <ObserveFields busy={busy} onCancel={onCancel} onCommit={onCommit} caseId={item.id} />
        )}
        {item.stage === 'READY_FOR_PICKUP' && (
          <DeliveryFields item={item} busy={busy} onCancel={onCancel} onCommit={onCommit} />
        )}
      </div>
    </div>
  );
}

function QuoteFields({
  caseId,
  busy,
  onCancel,
  onCommit,
}: {
  caseId: string;
  busy: boolean;
  onCancel: () => void;
  onCommit: (run: () => Promise<unknown>) => void;
}) {
  const [lenses, setLenses] = useState('');
  const [frame, setFrame] = useState('');
  const [leadDays, setLeadDays] = useState('');
  const [amount, setAmount] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    onCommit(() =>
      api.submitQuote(caseId, {
        lenses,
        frame,
        ...(leadDays ? { leadDays: Number(leadDays) } : {}),
        ...(amount ? { amount: Number(amount) } : {}),
      }),
    );
  }

  return (
    <form onSubmit={submit} className="stack-tight">
      <p className="muted">
        El presupuesto lo carga la óptica. Con ese presupuesto se arma la orden de compra, que es lo
        que se aprueba.
      </p>
      <label htmlFor="cristales">Cristales</label>
      <input id="cristales" value={lenses} onChange={(e) => setLenses(e.target.value)} required />
      <label htmlFor="armazon">Armazón</label>
      <input id="armazon" value={frame} onChange={(e) => setFrame(e.target.value)} required />
      <div className="grid">
        <div>
          <label htmlFor="plazo">Días de fabricación (opcional)</label>
          <input id="plazo" type="number" min="0" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} />
        </div>
        <div>
          <label htmlFor="monto">Monto (opcional)</label>
          <input id="monto" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="actions">
        <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Armar orden de compra'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function ApproveFields({
  caseId,
  busy,
  onCancel,
  onCommit,
}: {
  caseId: string;
  busy: boolean;
  onCancel: () => void;
  onCommit: (run: () => Promise<unknown>) => void;
}) {
  return (
    <div className="stack-tight">
      <p>Se aprueba la orden de compra y el expediente pasa a producción.</p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => onCommit(() => api.decideQuote(caseId, true))}>
          {busy ? 'Aprobando…' : 'Aprobar orden'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function ObserveFields({
  caseId,
  busy,
  onCancel,
  onCommit,
}: {
  caseId: string;
  busy: boolean;
  onCancel: () => void;
  onCommit: (run: () => Promise<unknown>, patch?: { holdNote?: string | null }) => void;
}) {
  const [note, setNote] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    onCommit(() => api.decideQuote(caseId, false, note), { holdNote: note.trim() });
  }

  return (
    <form onSubmit={submit} className="stack-tight">
      <label htmlFor="observacion">Qué corregir</label>
      <input
        id="observacion"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="El armazón no corresponde a la edad"
        required
      />
      <p className="muted">La orden vuelve al pedido de compra para que la óptica corrija el presupuesto.</p>
      <div className="actions">
        <button type="submit" disabled={busy || !note.trim()}>
          {busy ? 'Devolviendo…' : 'Observar y devolver'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function DeliveryFields({
  item,
  busy,
  onCancel,
  onCommit,
}: {
  item: CaseSummary;
  busy: boolean;
  onCancel: () => void;
  onCommit: (run: () => Promise<unknown>) => void;
}) {
  const person = item.person;
  const fullName = `${person.firstName} ${person.lastName}`;
  const menor = isMinor(person);
  const [isRepresentative, setIsRepresentative] = useState(menor === true);
  const [receivedBy, setReceivedBy] = useState(
    menor === true ? (person.representativeName ?? '') : fullName,
  );
  const [receivedByDni, setReceivedByDni] = useState('');
  const [note, setNote] = useState('');
  const faltaMotivo = menor === true && !isRepresentative && !note.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    onCommit(() =>
      api.registerDelivery(item.id, {
        deliveredAt: new Date().toISOString(),
        receivedBy,
        isRepresentative,
        ...(isRepresentative && receivedByDni.trim() ? { receivedByDni } : {}),
        ...(note.trim() ? { note } : {}),
      }),
    );
  }

  return (
    <form onSubmit={submit} className="stack-tight">
      {menor === true && (
        <p className="aviso">
          {fullName} es menor. Los anteojos se le entregan a su padre, madre o tutor.
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={isRepresentative}
          onChange={(e) => setIsRepresentative(e.target.checked)}
        />
        {menor === true ? 'Retira el padre, la madre o el tutor' : 'Retira un representante'}
      </label>
      <label htmlFor="recibio">{isRepresentative ? 'Nombre de quien retira' : 'Quién retiró'}</label>
      <input id="recibio" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} required />
      {isRepresentative && (
        <>
          <label htmlFor="dni-retira">DNI de quien retira</label>
          <input id="dni-retira" value={receivedByDni} inputMode="numeric" onChange={(e) => setReceivedByDni(e.target.value)} />
        </>
      )}
      {menor === true && !isRepresentative && (
        <>
          <label htmlFor="motivo-entrega">Por qué se los lleva la propia persona</label>
          <input id="motivo-entrega" value={note} onChange={(e) => setNote(e.target.value)} required />
        </>
      )}
      <div className="actions">
        <button type="submit" disabled={busy || faltaMotivo}>
          {busy ? 'Guardando…' : 'Registrar la entrega'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

type SortKey = 'code' | 'person' | 'neighborhood' | 'stage' | 'days';

function cardStay(iso: string): string {
  const days = daysSince(iso);
  if (days <= 0) return 'Entró hoy a esta etapa';
  if (days === 1) return 'Lleva 1 día en esta etapa';
  return `Lleva ${days} días en esta etapa`;
}

function cardSince(iso: string): string {
  if (daysSince(iso) <= 0) return `a las ${whenInStage(iso)}`;
  return `desde el ${formatDate(iso)}`;
}

function latestBudget(item: CaseSummary) {
  const quotes = item.quotes ?? [];
  return quotes.reduce<(typeof quotes)[number] | null>(
    (best, quote) => (!best || quote.version > best.version ? quote : best),
    null,
  );
}

function BudgetLine({ item }: { item: CaseSummary }) {
  const budget = latestBudget(item);
  const shop = item.optician?.name ?? 'la óptica';
  if (!budget) {
    return (
      <span className="kanban-budget missing">
        {item.stage === 'APPROVAL' ? 'Orden sin presupuesto' : `Sin presupuesto de ${shop}`}
      </span>
    );
  }
  return (
    <span className="kanban-budget">
      {item.stage === 'APPROVAL' && <strong>Orden para aprobar</strong>}
      <span>Presupuesto de {shop}</span>
      <strong>{budget.amount != null ? money(budget.amount) : 'Sin monto'}</strong>
      <span>
        {budget.lenses} · {budget.frame}
        {budget.leadDays != null ? ` · ${budget.leadDays} días` : ''}
      </span>
    </span>
  );
}

function money(amount: string): string {
  const value = Number(amount);
  if (Number.isNaN(value)) return amount;
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function pairLine(item: CaseSummary): string {
  const delivered = deliveredOf(item);
  if (item.pairs === 1) return `${delivered} de 1 par entregado`;
  return `${delivered} de ${item.pairs} pares entregados`;
}

function stayLabel(iso: string): string {
  const days = daysSince(iso);
  if (days <= 0) return 'Hoy';
  if (days === 1) return '1 día';
  return `${days} días`;
}

function sortCases(
  items: CaseSummary[],
  sort: { key: SortKey; dir: 'asc' | 'desc' } | null,
): CaseSummary[] {
  if (!sort) return items;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir;
    return String(left).localeCompare(String(right), 'es') * dir;
  });
}

function sortValue(item: CaseSummary, key: SortKey): string | number {
  if (key === 'code') return item.code;
  if (key === 'person') return `${item.person.lastName} ${item.person.firstName}`;
  if (key === 'neighborhood') return item.person.neighborhood ?? '';
  if (key === 'stage') return STAGE_ORDER.indexOf(item.stage);
  return daysSince(item.stageSince);
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
