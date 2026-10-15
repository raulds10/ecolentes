import { useEffect, useState } from 'react';
import {
  api,
  CHANNEL_LABELS,
  formatDate,
  formatDni,
  IS_DEMO,
  SOCIAL_NETWORK_LABELS,
  STAGE_LABELS,
  type IntakeRow,
  type SocialIntakeResult,
  type SocialNetwork,
} from './lib/api';

const EMPTY = {
  dni: '',
  firstName: '',
  lastName: '',
  socialNetwork: 'WHATSAPP' as SocialNetwork,
  phone: '',
  neighborhood: '',
  reason: '',
  notes: '',
};

/** El link que se le pasa al vecino cuando prefiere escribir él los datos. */
function publicFormUrl(): string {
  const { origin, pathname } = window.location;
  // En la demostración la página se sirve desde una ruta fija, así que el
  // formulario va en el hash en lugar de en su propia dirección.
  return IS_DEMO ? `${origin}${pathname}#/solicitud` : `${origin}/solicitud`;
}

/**
 * El panel de quien atiende WhatsApp, Facebook e Instagram. Carga el pedido sin
 * salir de la conversación: no hay integración con Meta, y esto es lo que la
 * reemplaza. El expediente que sale de acá entra a la misma bandeja que los demás.
 */
export function Redes({ onOpen }: { onOpen: (caseId: string) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState<SocialIntakeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<IntakeRow[] | null>(null);
  const [copied, setCopied] = useState(false);

  function refresh() {
    api
      .recentIntake()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(refresh, []);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(force: boolean) {
    setSaving(true);
    setError(null);
    try {
      const sent = await api.intakeFromSocialMedia({
        dni: form.dni,
        firstName: form.firstName,
        lastName: form.lastName,
        socialNetwork: form.socialNetwork,
        phone: form.phone || undefined,
        neighborhood: form.neighborhood || undefined,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
        force,
      });
      setResult(sent);
      if (sent.created) {
        setForm(EMPTY);
        refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function verify(personId: string) {
    try {
      await api.verifyIdentity(personId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h2>Redes</h2>
        <p className="muted">
          Lo que cargues acá abre un expediente igual que el de territorio. Si la persona prefiere
          escribir sus datos, pasale el link del formulario.
        </p>
      </header>
      <div className="card stack-tight">
        <h3>Cargar un pedido</h3>

        <form
          className="stack-tight"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <div className="grid">
            <div>
              <label htmlFor="red">Por dónde escribió</label>
              <select
                id="red"
                value={form.socialNetwork}
                onChange={(e) => set('socialNetwork', e.target.value)}
              >
                {Object.entries(SOCIAL_NETWORK_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dni">DNI</label>
              <input
                id="dni"
                value={form.dni}
                inputMode="numeric"
                placeholder="Sin puntos"
                onChange={(e) => set('dni', e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="apellido">Apellido</label>
              <input
                id="apellido"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="nombre">Nombre</label>
              <input
                id="nombre"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="tel">Teléfono</label>
              <input id="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label htmlFor="barrio">Barrio</label>
              <input
                id="barrio"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
              />
            </div>
            <div className="full">
              <label htmlFor="motivo">Qué pidió, en sus palabras</label>
              <input
                id="motivo"
                value={form.reason}
                placeholder="Ej.: no ve de lejos y no puede pagar los anteojos"
                onChange={(e) => set('reason', e.target.value)}
              />
            </div>
            <div className="full">
              <label htmlFor="notas">Notas de la conversación</label>
              <input
                id="notas"
                value={form.notes}
                placeholder="Lo que haga falta recordar. Queda en el historial del expediente"
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          {result && !result.created && result.duplicate && (
            <div className="warn-box">
              <p>
                Esta persona ya tiene el <strong>{result.duplicate.code}</strong> abierto, en{' '}
                {STAGE_LABELS[result.duplicate.stage]}.
              </p>
              <div className="actions">
                <button type="button" onClick={() => onOpen(result.duplicate!.caseId)}>
                  Abrir el que ya existe
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={saving}
                  onClick={() => void submit(true)}
                >
                  Es otro pedido, cargarlo igual
                </button>
              </div>
            </div>
          )}

          {result?.created && result.case && (
            <p className="ok-box">
              Expediente <strong>{result.case.code}</strong> creado.{' '}
              <button type="button" className="link" onClick={() => onOpen(result.case!.id)}>
                Abrirlo
              </button>
            </p>
          )}

          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Cargar el pedido'}
            </button>
          </div>
        </form>
      </div>

      <div className="card stack-tight">
        <h3>El link para mandarle al vecino</h3>
        <p className="muted">
          Es el mismo para las tres redes. Lo que entra por ahí queda con la identidad sin
          verificar hasta que alguien hable con la persona.
        </p>
        <div className="row">
          <input readOnly value={publicFormUrl()} aria-label="Link del formulario público" />
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(publicFormUrl());
              setCopied(true);
            }}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="card stack-tight">
        <h3>Últimos pedidos por redes y formulario</h3>
        {rows === null && <p className="muted">Cargando…</p>}
        {rows?.length === 0 && <p className="muted">Todavía no entró ninguno por estos canales.</p>}
        {rows && rows.length > 0 && (
          <ul className="cases">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="intake-row">
                  <button type="button" className="link" onClick={() => onOpen(r.id)}>
                    {r.code}
                  </button>
                  <span className="who">
                    <strong>
                      {r.person.lastName}, {r.person.firstName}
                    </strong>
                    <span className="muted">
                      DNI {formatDni(r.person.dni)}
                      {r.person.phone ? ` · ${r.person.phone}` : ''}
                    </span>
                  </span>
                  <span className="stage-cell">
                    <span className="chip">
                      {r.socialNetwork
                        ? SOCIAL_NETWORK_LABELS[r.socialNetwork]
                        : CHANNEL_LABELS[r.channel]}
                    </span>
                    <span className="days">{formatDate(r.createdAt)}</span>
                    <span className="chip">{STAGE_LABELS[r.stage]}</span>
                  </span>
                  {!r.person.identityVerified && (
                    <span className="verify">
                      <span className="chip hold">Identidad por verificar</span>
                      <button
                        type="button"
                        className="link"
                        onClick={() => void verify(r.person.id)}
                      >
                        Hablé con la persona, verificar
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
