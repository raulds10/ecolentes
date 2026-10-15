import { useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  ATTACHMENT_LABELS,
  CHANNEL_LABELS,
  formatDni,
  type IntakeChannel,
  type Person,
} from './lib/api';
import { BirthDate, birthDateFields, EMPTY_BIRTH_DATE } from './BirthDate';
import { PhotoField, type Photo } from './PhotoField';

/**
 * Carga de un pedido nuevo. Pensada para usarse en el barrio desde el teléfono,
 * pero es la misma pantalla web de siempre. Primero el DNI, porque si la
 * persona ya fue atendida su ficha existe y no hay que volver a cargarla.
 */
export function NewCase({ onCreated }: { onCreated: (caseId: string) => void }) {
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
      const created = await api.createCase({
        personId: target.id,
        channel,
        ...(reason ? { reason } : {}),
      });

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
    <div className="stack phone">
      <header className="page-head">
        <h2>Pedido nuevo</h2>
        <p className="muted">Primero el DNI. Si la persona ya tiene ficha, no se vuelve a cargar.</p>
      </header>
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
          <Channel value={channel} onChange={setChannel} />
          <Reason value={reason} onChange={setReason} />
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
          <Channel value={channel} onChange={setChannel} />
          <Reason value={reason} onChange={setReason} />
          <Receta value={prescription} onChange={setPrescription} />
          <button type="submit" disabled={busy || sinEdad}>
            {busy ? 'Cargando…' : 'Cargar ficha y pedido'}
          </button>
        </form>
      )}
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
}: {
  value: IntakeChannel;
  onChange: (v: IntakeChannel) => void;
}) {
  return (
    <>
      <label htmlFor="canal">Por dónde llegó</label>
      <select
        id="canal"
        value={value}
        onChange={(e) => onChange(e.target.value as IntakeChannel)}
      >
        {(Object.keys(CHANNEL_LABELS) as IntakeChannel[]).map((c) => (
          <option key={c} value={c}>
            {CHANNEL_LABELS[c]}
          </option>
        ))}
      </select>
    </>
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
