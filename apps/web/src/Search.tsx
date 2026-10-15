import { useEffect, useState } from 'react';
import {
  api,
  daysSince,
  formatDate,
  formatDni,
  HOLD_LABELS,
  STAGE_LABELS,
  type PersonWithSummary,
} from './lib/api';
import { PersonForm } from './PersonForm';

type Props = { onOpen: (id: string) => void; onOpenCase: (id: string) => void };

/** Cuántas fichas por página. Entran en una pantalla sin tener que bajar mucho. */
const PAGE_SIZE = 25;

export function Search({ onOpen, onOpenCase }: Props) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<PersonWithSummary[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [creatingDni, setCreatingDni] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const texto = query.trim();

  // Escribir arranca de nuevo desde la primera página: quedarse en la cuarta
  // mostraría vacío aunque la búsqueda tenga resultados.
  useEffect(() => setPage(0), [texto]);

  /**
   * La tabla se carga sola al entrar, y vuelve a buscar mientras se escribe.
   * Espera un momento entre tecla y tecla para no mandar una consulta por
   * carácter, y cancela la anterior: si no, con un DNI de ocho dígitos la
   * respuesta de "3162" puede llegar después de la de "31620034" y pisarla.
   *
   * Pide una ficha más de las que muestra: si vuelve, hay página siguiente, y
   * así no hace falta una consulta aparte para contar el total.
   */
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setSearching(true);
        setError(null);
        api
          .searchPeople(
            { q: texto, skip: page * PAGE_SIZE, take: PAGE_SIZE + 1 },
            controller.signal,
          )
          .then((found) => {
            setHayMas(found.length > PAGE_SIZE);
            setResults(found.slice(0, PAGE_SIZE));
          })
          .catch((e: Error) => {
            if (controller.signal.aborted) return;
            setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setSearching(false);
          });
      },
      texto ? 250 : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [texto, page]);

  const digitsOnly = texto.replace(/\D/g, '');
  const looksLikeDni = digitsOnly.length >= 7 && digitsOnly.length <= 8;

  if (creatingDni) {
    return (
      <PersonForm
        dni={creatingDni}
        onCreated={(person) => onOpen(person.id)}
        onCancel={() => setCreatingDni(null)}
      />
    );
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h2>Personas</h2>
        <p className="muted">La ficha única, con el expediente y los anteojos a la vista.</p>
      </header>
      <div className="card search">
        <label htmlFor="q">Buscar por DNI, apellido o nombre</label>
        <input
          id="q"
          value={query}
          placeholder="31.620.034"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="muted">
          Filtra mientras escribís. Buscá siempre antes de cargar: si la persona ya fue atendida, su
          ficha existe.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {results === null && searching && <p className="muted">Cargando…</p>}

      {results && results.length === 0 && texto === '' && (
        <div className="card">
          <p className="muted">Todavía no hay ninguna ficha cargada.</p>
        </div>
      )}

      {results && results.length === 0 && texto !== '' && (
        <div className="card">
          <p>No hay ninguna ficha que coincida con “{texto}”.</p>
          {looksLikeDni ? (
            <button type="button" onClick={() => setCreatingDni(digitsOnly)}>
              Cargar ficha nueva con DNI {formatDni(digitsOnly)}
            </button>
          ) : (
            <p className="muted">Para cargar una ficha nueva, buscá primero por el DNI.</p>
          )}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="card stack-tight">
          <table className="report people">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Expediente en curso</th>
                <th>Anteojos</th>
                <th>Edad</th>
                <th>Barrio</th>
              </tr>
            </thead>
            <tbody>
              {results.map((person) => (
                <Row
                  key={person.id}
                  person={person}
                  onOpen={() => onOpen(person.id)}
                  onOpenCase={onOpenCase}
                />
              ))}
            </tbody>
          </table>
          <div className="row between">
            <p className="muted">
              {page > 0 || hayMas
                ? `Fichas ${page * PAGE_SIZE + 1} a ${page * PAGE_SIZE + results.length}`
                : `${results.length} ${results.length === 1 ? 'ficha' : 'fichas'}`}
              . Tocá una fila para abrir la ficha completa.
            </p>
            {(page > 0 || hayMas) && (
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={page === 0 || searching}
                  onClick={() => setPage((actual) => actual - 1)}
                >
                  Anteriores
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!hayMas || searching}
                  onClick={() => setPage((actual) => actual + 1)}
                >
                  Siguientes
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  person,
  onOpen,
  onOpenCase,
}: {
  person: PersonWithSummary;
  onOpen: () => void;
  onOpenCase: (id: string) => void;
}) {
  const { summary } = person;
  const open = summary.openCase;
  const daysOpen = open ? daysSince(open.stageSince) : null;

  return (
    <tr className="clickable" onClick={onOpen}>
      <td data-label="Persona">
        <span className="person-id">
          <strong>
            {person.lastName}, {person.firstName}
          </strong>
          <span className="muted">DNI {formatDni(person.dni)}</span>
        </span>
      </td>
      <td data-label="Expediente en curso">
        {open ? (
          <button
            type="button"
            className="link case-link"
            onClick={(event) => {
              event.stopPropagation();
              onOpenCase(open.id);
            }}
          >
            <strong>{open.code}</strong>
            <span className="case-meta">
              <span className="chip">{STAGE_LABELS[open.stage]}</span>
              <span className={open.overdue ? 'days late' : 'days'}>
                hace {daysOpen} {daysOpen === 1 ? 'día' : 'días'}
              </span>
            </span>
            {open.hold && <span className="chip hold">{HOLD_LABELS[open.hold]}</span>}
          </button>
        ) : (
          <span className="muted">Sin expediente abierto</span>
        )}
      </td>
      <td data-label="Anteojos">
        {summary.cases === 0 ? (
          <span className="muted">Nunca pidió</span>
        ) : (
          <span className="glasses-summary">
            {open && open.glasses.length > 0 && (
              <span className="pair-codes">
                {open.glasses.map((pair) => (
                  <span key={pair.code}>{pair.code}</span>
                ))}
              </span>
            )}
            <span>
              {summary.pairsDelivered} de {summary.pairsRequested}{' '}
              {summary.pairsRequested === 1 ? 'par entregado' : 'pares entregados'}
            </span>
            {summary.lastDeliveryAt && (
              <span className="muted">último el {formatDate(summary.lastDeliveryAt)}</span>
            )}
          </span>
        )}
      </td>
      <td data-label="Edad">
        <span className="age">
          {summary.age == null ? (
            <span className="muted">Sin edad</span>
          ) : (
            <span>
              {summary.age} {summary.age === 1 ? 'año' : 'años'}
            </span>
          )}
          {summary.isMinor === true && <span className="chip">menor</span>}
        </span>
      </td>
      <td data-label="Barrio">{person.neighborhood ?? <span className="muted">Sin barrio</span>}</td>
    </tr>
  );
}
