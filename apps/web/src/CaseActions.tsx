import { useState, type FormEvent } from 'react';
import { isMinor } from '@ecolentes/shared';
import { api, formatDni, type CaseDetail, type Role } from './lib/api';

type Props = { detail: CaseDetail; role: Role; onDone: () => void };

/**
 * Lo que este rol puede hacer con el expediente ahora mismo. Se muestra sólo
 * la acción que corresponde a la etapa, para que nadie tenga que acordarse
 * del circuito.
 */
export function CaseActions({ detail, role, onDone }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done = 'Quedó guardado.') {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      setConfirmClose(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer');
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = role === 'ADMIN';
  const can = (r: Role) => role === r || isAdmin;

  return (
    <div className="card">
      <h3>Próximo paso</h3>
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

      {detail.stage === 'REQUEST' && can('OPERATOR') && (
        <ActionButton
          busy={busy}
          label="Mandar a evaluación"
          onClick={() => run(() => api.moveStage(detail.id, 'ASSESSMENT'))}
        />
      )}

      {detail.stage === 'ASSESSMENT' && (can('OPHTHALMOLOGIST') || can('OPERATOR')) && (
        <PrescriptionForm detail={detail} role={role} busy={busy} run={run} />
      )}

      {detail.stage === 'OPTICIAN_QUOTE' && can('OPTICIAN') && (
        <QuoteForm caseId={detail.id} busy={busy} run={run} />
      )}

      {detail.stage === 'APPROVAL' && can('DIRECTOR') && (
        <ApprovalForm caseId={detail.id} busy={busy} run={run} />
      )}

      {detail.stage === 'PRODUCTION' && can('OPTICIAN') && (
        <ActionButton
          busy={busy}
          label="Enviar al depósito"
          onClick={() => run(() => api.moveStage(detail.id, 'RECEIVED'))}
        />
      )}

      {detail.stage === 'RECEIVED' && can('OPERATOR') && (
        <ActionButton
          busy={busy}
          label="Controlado, listo para entregar"
          onClick={() => run(() => api.moveStage(detail.id, 'READY_FOR_PICKUP'))}
        />
      )}

      {detail.stage === 'READY_FOR_PICKUP' && can('OPERATOR') && (
        <DeliveryForm caseId={detail.id} person={detail.person} busy={busy} run={run} />
      )}

      {detail.stage === 'DELIVERED' && can('OPERATOR') && (
        confirmClose ? (
          <div className="stack-tight">
            <p>Se cierra el expediente y deja de figurar como pendiente.</p>
            <div className="actions">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => api.moveStage(detail.id, 'CLOSED'), 'El expediente quedó cerrado.')
                }
              >
                {busy ? 'Guardando…' : 'Cerrar'}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmClose(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirmClose(true)}>
            Cerrar el expediente
          </button>
        )
      )}

      {detail.stage === 'CLOSED' && <p className="muted">El expediente está cerrado.</p>}
    </div>
  );
}

function ActionButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={busy} onClick={onClick}>
      {busy ? 'Guardando…' : label}
    </button>
  );
}

function PrescriptionForm({
  detail,
  role,
  busy,
  run,
}: {
  detail: CaseDetail;
  role: Role;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [text, setText] = useState(detail.prescription?.rawText ?? '');
  const validated = detail.prescription?.validatedAt != null;

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => api.setPrescription(detail.id, text));
  }

  return (
    <form onSubmit={submit} className="stack-tight">
      <label htmlFor="receta">Graduación, como figura en la receta</label>
      <input
        id="receta"
        value={text}
        placeholder="LEJOS OD 180°-3,50 // OI 180°-2,75 - CERCA ADD+1,50 AO"
        onChange={(e) => setText(e.target.value)}
        required
      />
      <p className="muted">
        Se guarda tal cual y además se separa por ojo, para que la óptica no vuelva a tipearla.
      </p>
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar receta'}
        </button>
        {validated && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void run(() => api.moveStage(detail.id, 'OPTICIAN_QUOTE'))}
          >
            Mandar a la óptica
          </button>
        )}
      </div>
      {!validated && detail.prescription && (
        <p className="muted">
          La receta todavía no fue validada por el profesional, así que no puede ir a la óptica.
        </p>
      )}
      {role !== 'OPHTHALMOLOGIST' && (
        <p className="muted">Si la cargás vos, el profesional después tiene que validarla.</p>
      )}
    </form>
  );
}

function QuoteForm({
  caseId,
  busy,
  run,
}: {
  caseId: string;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [lenses, setLenses] = useState('');
  const [frame, setFrame] = useState('');
  const [leadDays, setLeadDays] = useState('');
  const [amount, setAmount] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() =>
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
      <div className="grid">
        <div>
          <label htmlFor="cristales">Cristales</label>
          <input
            id="cristales"
            value={lenses}
            onChange={(e) => setLenses(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="armazon">Armazón</label>
          <input id="armazon" value={frame} onChange={(e) => setFrame(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="plazo">Días de fabricación (opcional)</label>
          <input
            id="plazo"
            type="number"
            min="0"
            value={leadDays}
            onChange={(e) => setLeadDays(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="monto">Monto (opcional)</label>
          <input
            id="monto"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
      <button type="submit" disabled={busy}>
        {busy ? 'Enviando…' : 'Armar orden de compra'}
      </button>
    </form>
  );
}

function ApprovalForm({
  caseId,
  busy,
  run,
}: {
  caseId: string;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [note, setNote] = useState('');

  return (
    <div className="stack-tight">
      <label htmlFor="observacion">Qué corregir (hace falta sólo para observar)</label>
      <input
        id="observacion"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="El armazón no corresponde a la edad"
      />
      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.decideQuote(caseId, true, note || undefined))}
        >
          Aprobar orden
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !note.trim()}
          onClick={() => void run(() => api.decideQuote(caseId, false, note))}
        >
          Observar y devolver
        </button>
      </div>
      {!note.trim() && (
        <p className="muted">Para observar la orden hay que decir qué corregir.</p>
      )}
    </div>
  );
}

function DeliveryForm({
  caseId,
  person,
  busy,
  run,
}: {
  caseId: string;
  person: CaseDetail['person'];
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const fullName = `${person.firstName} ${person.lastName}`;
  const menor = isMinor(person);

  // Si es menor, la entrega arranca marcada como "retira el tutor": es lo que
  // corresponde, y así nadie tiene que acordarse de tildarlo.
  const [isRepresentative, setIsRepresentative] = useState(menor === true);
  const [receivedBy, setReceivedBy] = useState(
    menor === true ? (person.representativeName ?? '') : fullName,
  );
  const [receivedByDni, setReceivedByDni] = useState('');
  const [note, setNote] = useState('');

  const faltaMotivo = menor === true && !isRepresentative && !note.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() =>
      api.registerDelivery(caseId, {
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
          {fullName} es menor de edad ({person.representativeBond?.toLowerCase() ?? 'tutor'}
          {person.representativeName ? `: ${person.representativeName}` : ''}). Los anteojos se le
          entregan a su padre, madre o tutor.
        </p>
      )}
      {menor === null && (
        <p className="muted">
          La ficha no tiene fecha de nacimiento ni edad, así que no se puede saber si es menor.
          Completala si hace falta.
        </p>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={isRepresentative}
          onChange={(e) => {
            setIsRepresentative(e.target.checked);
            if (e.target.checked) {
              // El motivo es para cuando retira el propio chico: si retira el
              // tutor no corresponde, y quedaría escrito en el expediente algo
              // que no pasó.
              setNote('');
              if (receivedBy === fullName) setReceivedBy(person.representativeName ?? '');
            } else if (receivedBy === (person.representativeName ?? '')) {
              setReceivedBy(fullName);
            }
          }}
        />
        {menor === true ? 'Retira el padre, la madre o el tutor' : 'Retira un representante'}
      </label>

      <label htmlFor="recibio">{isRepresentative ? 'Nombre de quien retira' : 'Quién retiró'}</label>
      <input
        id="recibio"
        value={receivedBy}
        placeholder={isRepresentative ? 'Nombre y apellido del tutor' : fullName}
        onChange={(e) => setReceivedBy(e.target.value)}
        required
      />

      {isRepresentative && (
        <>
          <label htmlFor="dni-retira">DNI de quien retira (opcional)</label>
          <input
            id="dni-retira"
            value={receivedByDni}
            placeholder="27.884.102"
            inputMode="numeric"
            onChange={(e) => setReceivedByDni(e.target.value)}
          />
          <p className="muted">
            Queda en el expediente como respaldo de a quién se le dieron los anteojos.
            {receivedByDni.replace(/\D/g, '').length >= 7 &&
              ` Se guarda ${formatDni(receivedByDni.replace(/\D/g, ''))}.`}
          </p>
        </>
      )}

      {menor === true && !isRepresentative && (
        <>
          <label htmlFor="motivo-entrega">Por qué se los lleva la propia persona</label>
          <input
            id="motivo-entrega"
            value={note}
            placeholder="Vino solo al CAC y la madre autorizó por teléfono"
            onChange={(e) => setNote(e.target.value)}
            required
          />
          <p className="muted">
            Se puede entregar igual, pero el motivo queda escrito en el expediente.
          </p>
        </>
      )}

      <button type="submit" disabled={busy || faltaMotivo}>
        {busy ? 'Guardando…' : 'Registrar la entrega'}
      </button>
    </form>
  );
}
