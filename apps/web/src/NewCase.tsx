import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  ATTACHMENT_LABELS,
  CHANNEL_LABELS,
  formatDate,
  formatDni,
  IS_DEMO,
  SOCIAL_NETWORK_LABELS,
  STAGE_LABELS,
  type IntakeChannel,
  type IntakeRow,
  type Person,
  type SocialNetwork,
} from './lib/api';
import { BirthDate, birthDateFields, EMPTY_BIRTH_DATE } from './BirthDate';
import { PhotoField, type Photo } from './PhotoField';

/**
 * Carga de un pedido nuevo. Pensada para usarse en el barrio desde el teléfono,
 * pero es la misma pantalla web de siempre. Primero el DNI, porque si la
 * persona ya fue atendida su ficha existe y no hay que volver a cargarla.
 */
export function NewCase({ onCreated }: { onCreated: (caseId: string) => void }) {
  const [network, setNetwork] = useState<SocialNetwork>('WHATSAPP');
  const [notes, setNotes] = useState('');
  const [duplicate, setDuplicate] = useState<{
    caseId: string;
    code: string;
    stage: IntakeRow['stage'];
  } | null>(null);
  const [rows, setRows] = useState<IntakeRow[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [dni, setDni] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    neighborhood: '',
    representativeName: '',
    ...EMPTY_BIRTH_DATE,
  });
  const [channel, setChannel] = useState<IntakeChannel>('NEIGHBORHOOD_SURVEY');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Las fotos esperan acá hasta que el pedido se guarda: antes de eso no hay
  // todavía ficha ni expediente al que engancharlas.
  const [dniFront, setDniFront] = useState<Photo | null>(null);
  const [dniBack, setDniBack] = useState<Photo | null>(null);
  const [prescription, setPrescription] = useState<Photo | null>(null);
  /** El pedido se cargó pero alguna foto no subió: se avisa sin perderlo. */
  const [fotosPendientes, setFotosPendientes] = useState<{
    caseId: string;
    cuales: string[];
  } | null>(null);

  // Sin fecha ni edad no se puede saber si es menor, y de eso depende a quién se
  // le entregan los anteojos. Se pide una de las dos antes de guardar la ficha.
  const sinEdad = form.birthDate === '' && form.ageAtIntake === '';

  function refreshIntake() {
    api
      .recentIntake()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(refreshIntake, []);

  async function lookUp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPerson(null);
    setNotFound(false);
    setBusy(true);
    try {
      setPerson(await api.personByDni(dni));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(e instanceof Error ? e.message : 'No se pudo buscar');
    } finally {
      setBusy(false);
    }
  }

  async function openFromSocial(
    target: Person,
    input: { network: SocialNetwork; reason: string; notes: string; force: boolean },
  ) {
    const sent = await api.intakeFromSocialMedia({
      dni: target.dni,
      firstName: target.firstName,
      lastName: target.lastName,
      socialNetwork: input.network,
      ...(target.phone ? { phone: target.phone } : {}),
      ...(target.neighborhood ? { neighborhood: target.neighborhood } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      force: input.force,
    });
    if (!sent.created || !sent.case) {
      setDuplicate(sent.duplicate);
      return null;
    }
    return { id: sent.case.id };
  }

  async function submit(event: FormEvent | null, force = false) {
    event?.preventDefault();
    setError(null);
    setDuplicate(null);
    setBusy(true);
    try {
      const target =
        person ??
        (await api.createPerson({
          dni,
          firstName: form.firstName,
          lastName: form.lastName,
          ...birthDateFields(form),
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.neighborhood ? { neighborhood: form.neighborhood } : {}),
          ...(form.representativeName ? { representativeName: form.representativeName } : {}),
        }));
      const created =
        channel === 'SOCIAL_MEDIA'
          ? await openFromSocial(target, { network, reason, notes, force })
          : await api.createCase({
              personId: target.id,
              channel,
              ...(reason ? { reason } : {}),
            });
      if (!created) return;

      // Las fotos van después del pedido y no lo frenan: si alguna no sube,
      // el pedido ya quedó cargado y la foto se agrega desde el expediente.
      const fallaron = await uploadPhotos({
        personId: target.id,
        caseId: created.id,
        dniFront,
        dniBack,
        prescription,
      });
      if (fallaron.length > 0) {
        refreshIntake();
        setFotosPendientes({ caseId: created.id, cuales: fallaron });
        return;
      }

      onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el pedido');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h2>Pedido nuevo</h2>
        <p className="muted">
          El mismo pedido, haya llegado por el barrio o por redes. Primero el DNI: si la persona ya
          tiene ficha, no se vuelve a cargar.
        </p>
      </header>
      <PublicLink copied={copied} onCopied={() => setCopied(true)} />
      <form className="card" onSubmit={lookUp}>
        <label htmlFor="dni">DNI de la persona</label>
        <div className="row">
          <input
            id="dni"
            inputMode="numeric"
            value={dni}
            placeholder="31620034"
            onChange={(e) => setDni(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            Buscar
          </button>
        </div>
        <p className="muted">Alcanza con el número, no hace falta el documento.</p>

        <PhotoField
          id="dni-frente"
          label="Foto del DNI, frente (optativo)"
          hint="Si la persona tiene el documento a mano, sacale una foto. Si no, seguí igual."
          value={dniFront}
          onChange={setDniFront}
        />
        <PhotoField
          id="dni-dorso"
          label="Foto del DNI, dorso (optativo)"
          value={dniBack}
          onChange={setDniBack}
        />
        <p className="muted">Las fotos se guardan cuando cargás el pedido, acá abajo.</p>
      </form>

      {error && <p className="error">{error}</p>}

      {fotosPendientes && (
        <div className="card stack-tight">
          <p className="aviso">
            El pedido quedó cargado, pero no se pudieron guardar estas fotos:{' '}
            {fotosPendientes.cuales.join(', ')}. Pueden sacarse de nuevo desde el expediente.
          </p>
          <button type="button" onClick={() => onCreated(fotosPendientes.caseId)}>
            Abrir el expediente
          </button>
        </div>
      )}

      {person && (
        <form className="card" onSubmit={submit}>
          <h3>
            {person.lastName}, {person.firstName}
          </h3>
          <p className="muted">
            DNI {formatDni(person.dni)}
            {person.neighborhood ? ` · ${person.neighborhood}` : ''} · ya tiene ficha
          </p>
          <Channel
            value={channel}
            onChange={setChannel}
            network={network}
            onNetwork={setNetwork}
          />
          <Reason value={reason} onChange={setReason} />
          {channel === 'SOCIAL_MEDIA' && <Notes value={notes} onChange={setNotes} />}
          {duplicate && <Duplicate duplicate={duplicate} busy={busy} onOpen={onCreated} onForce={() => void submit(null, true)} />}
          <Receta value={prescription} onChange={setPrescription} />
          <button type="submit" disabled={busy}>
            {busy ? 'Cargando…' : 'Cargar el pedido'}
          </button>
        </form>
      )}

      {notFound && (
        <form className="card" onSubmit={submit}>
          <h3>Ficha nueva</h3>
          <p className="muted">DNI {formatDni(dni.replace(/\D/g, ''))}</p>
          <div className="grid">
            <div>
              <label htmlFor="apellido">Apellido</label>
              <input
                id="apellido"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="nombre">Nombre</label>
              <input
                id="nombre"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="tel">Contacto</label>
              <input
                id="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="barrio">Barrio</label>
              <input
                id="barrio"
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
              />
            </div>
            <BirthDate
              value={form}
              onChange={(value) => setForm((f) => ({ ...f, ...value }))}
              hasRepresentative={form.representativeName !== ''}
            />
            <div className="full">
              <label htmlFor="representante">Padre, madre o tutor, si es menor</label>
              <input
                id="representante"
                value={form.representativeName}
                onChange={(e) => setForm({ ...form, representativeName: e.target.value })}
              />
            </div>
          </div>
          {!form.phone && (
            <p className="muted">
              Sin teléfono no vamos a poder avisarle cuando lleguen los anteojos.
            </p>
          )}
          <Channel
            value={channel}
            onChange={setChannel}
            network={network}
            onNetwork={setNetwork}
          />
          <Reason value={reason} onChange={setReason} />
          {channel === 'SOCIAL_MEDIA' && <Notes value={notes} onChange={setNotes} />}
          {duplicate && <Duplicate duplicate={duplicate} busy={busy} onOpen={onCreated} onForce={() => void submit(null, true)} />}
          <Receta value={prescription} onChange={setPrescription} />
          <button type="submit" disabled={busy || sinEdad}>
            {busy ? 'Cargando…' : 'Cargar ficha y pedido'}
          </button>
        </form>
      )}

      <RecentIntake rows={rows} onOpen={onCreated} onVerified={refreshIntake} onError={setError} />
    </div>
  );
}

/**
 * Sube las fotos que se hayan sacado y devuelve las que no pudieron subir. Una
 * foto que falla no cancela a las demás ni al pedido: la foto es un respaldo,
 * el pedido es la atención.
 */
async function uploadPhotos(input: {
  personId: string;
  caseId: string;
  dniFront: Photo | null;
  dniBack: Photo | null;
  prescription: Photo | null;
}): Promise<string[]> {
  const pendientes = [
    { kind: 'DNI_FRONT' as const, photo: input.dniFront, personId: input.personId },
    { kind: 'DNI_BACK' as const, photo: input.dniBack, personId: input.personId },
    { kind: 'PRESCRIPTION' as const, photo: input.prescription, caseId: input.caseId },
  ].filter((p) => p.photo !== null);

  const results = await Promise.allSettled(
    pendientes.map(({ kind, photo, ...target }) =>
      api.uploadAttachment({ kind, dataUrl: photo!.dataUrl, ...target }),
    ),
  );

  return pendientes
    .filter((_, i) => results[i]!.status === 'rejected')
    .map((p) => ATTACHMENT_LABELS[p.kind]);
}

function Channel({
  value,
  onChange,
  network,
  onNetwork,
}: {
  value: IntakeChannel;
  onChange: (v: IntakeChannel) => void;
  network: SocialNetwork;
  onNetwork: (v: SocialNetwork) => void;
}) {
  const channels = (Object.keys(CHANNEL_LABELS) as IntakeChannel[]).filter(
    (item) => item !== 'PUBLIC_FORM',
  );
  return (
    <>
      <label htmlFor="canal">Por dónde llegó</label>
      <select id="canal" value={value} onChange={(e) => onChange(e.target.value as IntakeChannel)}>
        {channels.map((item) => (
          <option key={item} value={item}>
            {CHANNEL_LABELS[item]}
          </option>
        ))}
      </select>
      {value === 'SOCIAL_MEDIA' && (
        <>
          <label htmlFor="red">Por qué red</label>
          <select
            id="red"
            value={network}
            onChange={(e) => onNetwork(e.target.value as SocialNetwork)}
          >
            {(Object.keys(SOCIAL_NETWORK_LABELS) as SocialNetwork[]).map((item) => (
              <option key={item} value={item}>
                {SOCIAL_NETWORK_LABELS[item]}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );
}

function Notes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor="notas">Notas de la conversación</label>
      <input
        id="notas"
        value={value}
        placeholder="Lo que haga falta recordar. Queda en el historial del expediente"
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function Duplicate({
  duplicate,
  busy,
  onOpen,
  onForce,
}: {
  duplicate: { caseId: string; code: string; stage: IntakeRow['stage'] };
  busy: boolean;
  onOpen: (caseId: string) => void;
  onForce: () => void;
}) {
  return (
    <div className="warn-box">
      <p>
        Esta persona ya tiene el <strong>{duplicate.code}</strong> abierto, en{' '}
        {STAGE_LABELS[duplicate.stage]}.
      </p>
      <div className="actions">
        <button type="button" onClick={() => onOpen(duplicate.caseId)}>
          Abrir el que ya existe
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onForce}>
          Es otro pedido, cargarlo igual
        </button>
      </div>
    </div>
  );
}

function publicFormUrl(): string {
  const { origin, pathname } = window.location;
  return IS_DEMO ? `${origin}${pathname}#/solicitud` : `${origin}/solicitud`;
}

function PublicLink({ copied, onCopied }: { copied: boolean; onCopied: () => void }) {
  return (
    <div className="card stack-tight">
      <h3>Si prefiere escribirlo</h3>
      <p className="muted">
        Es el mismo link para WhatsApp, Facebook e Instagram. Lo que entra por ahí queda con la
        identidad sin verificar hasta que alguien hable con la persona.
      </p>
      <div className="row">
        <input readOnly value={publicFormUrl()} aria-label="Link del formulario público" />
        <button
          type="button"
          className="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(publicFormUrl());
            onCopied();
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function RecentIntake({
  rows,
  onOpen,
  onVerified,
  onError,
}: {
  rows: IntakeRow[] | null;
  onOpen: (caseId: string) => void;
  onVerified: () => void;
  onError: (message: string) => void;
}) {
  async function verify(personId: string) {
    try {
      await api.verifyIdentity(personId);
      onVerified();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo verificar');
    }
  }

  return (
    <div className="card stack-tight">
      <h3>Últimos pedidos por redes y formulario</h3>
      {rows === null && <p className="muted">Cargando…</p>}
      {rows?.length === 0 && <p className="muted">Todavía no entró ninguno por estos canales.</p>}
      {rows && rows.length > 0 && (
        <ul className="cases">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="intake-row">
                <button type="button" className="link" onClick={() => onOpen(row.id)}>
                  {row.code}
                </button>
                <span className="who">
                  <strong>
                    {row.person.lastName}, {row.person.firstName}
                  </strong>
                  <span className="muted">
                    DNI {formatDni(row.person.dni)}
                    {row.person.phone ? ` · ${row.person.phone}` : ''}
                  </span>
                </span>
                <span className="stage-cell">
                  <span className="chip">
                    {row.socialNetwork
                      ? SOCIAL_NETWORK_LABELS[row.socialNetwork]
                      : CHANNEL_LABELS[row.channel]}
                  </span>
                  <span className="days">{formatDate(row.createdAt)}</span>
                  <span className="chip">{STAGE_LABELS[row.stage]}</span>
                </span>
                {!row.person.identityVerified && (
                  <span className="verify">
                    <span className="chip hold">Identidad por verificar</span>
                    <button type="button" className="link" onClick={() => void verify(row.person.id)}>
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
  );
}

/**
 * La receta que la persona ya trajo del oftalmólogo. Es optativa: la mayoría
 * de las veces la graduación se toma después, en la jornada.
 */
function Receta({ value, onChange }: { value: Photo | null; onChange: (p: Photo | null) => void }) {
  return (
    <PhotoField
      id="receta"
      label="Foto de la receta del oftalmólogo (optativo)"
      hint="Si la persona trae una receta hecha, sacale una foto. Si no, la graduación se carga después."
      value={value}
      onChange={onChange}
    />
  );
}

function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor="motivo">Motivo</label>
      <input
        id="motivo"
        value={value}
        placeholder="ve borroso de lejos"
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}
