import { useState } from 'react';
import {
  api,
  ATTACHMENT_LABELS,
  type AttachmentKind,
  type CaseDetail,
  type Role,
} from './lib/api';
import { PhotoField, SavedPhoto, type Photo } from './PhotoField';

/** Quién ve cada foto. Es la misma regla que aplica la API al responder. */
const VIEWERS: Record<AttachmentKind, Role[]> = {
  DNI_FRONT: ['OPERATOR', 'SOCIAL_DESK', 'ADMIN'],
  DNI_BACK: ['OPERATOR', 'SOCIAL_DESK', 'ADMIN'],
  PRESCRIPTION: ['OPERATOR', 'OPHTHALMOLOGIST', 'OPTICIAN', 'SOCIAL_DESK', 'ADMIN'],
};

/** La óptica no carga fotos: trabaja con las que ya están. */
function puedeCargar(role: Role, kind: AttachmentKind): boolean {
  return VIEWERS[kind].includes(role) && role !== 'OPTICIAN';
}

/**
 * Las fotos del expediente: el DNI de la persona y la receta que trajo. Se
 * pueden sacar acá también, porque en el barrio muchas veces no hay señal para
 * subirlas en el momento del pedido.
 */
export function CasePhotos({
  detail,
  role,
  onChange,
}: {
  detail: CaseDetail;
  role: Role;
  onChange: () => void;
}) {
  const kinds = (Object.keys(VIEWERS) as AttachmentKind[]).filter((k) => VIEWERS[k].includes(role));
  if (kinds.length === 0) return null;

  return (
    <article className="card stack-tight">
      <h3>Fotos</h3>
      <p className="muted">
        Son optativas. Cada vez que alguien abre una queda registrado en la auditoría.
      </p>
      <div className="photo-slots">
        {kinds.map((kind) => (
          <PhotoSlot
            key={kind}
            kind={kind}
            detail={detail}
            puedeCargar={puedeCargar(role, kind)}
            onChange={onChange}
          />
        ))}
      </div>
    </article>
  );
}

function PhotoSlot({
  kind,
  detail,
  puedeCargar,
  onChange,
}: {
  kind: AttachmentKind;
  detail: CaseDetail;
  puedeCargar: boolean;
  onChange: () => void;
}) {
  const saved = detail.attachments.find((a) => a.kind === kind) ?? null;
  const [nueva, setNueva] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(photo: Photo) {
    setError(null);
    setBusy(true);
    try {
      await api.uploadAttachment({
        kind,
        dataUrl: photo.dataUrl,
        ...(kind === 'PRESCRIPTION' ? { caseId: detail.id } : { personId: detail.person.id }),
      });
      setNueva(null);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la foto');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-tight">
      {saved && (
        <SavedPhoto
          key={saved.id}
          label={ATTACHMENT_LABELS[kind]}
          load={() => api.attachment(saved.id)}
        />
      )}
      {puedeCargar && (
        <>
          <PhotoField
            id={`foto-${kind.toLowerCase()}`}
            label={saved ? `Reemplazar: ${ATTACHMENT_LABELS[kind]}` : ATTACHMENT_LABELS[kind]}
            hint={saved ? undefined : 'Todavía no hay foto cargada. Es optativa.'}
            value={nueva}
            onChange={setNueva}
          />
          {nueva && (
            <button type="button" disabled={busy} onClick={() => void save(nueva)}>
              {busy ? 'Guardando…' : 'Guardar la foto'}
            </button>
          )}
        </>
      )}
      {!puedeCargar && !saved && (
        <p className="muted">Sin foto de {ATTACHMENT_LABELS[kind].toLowerCase()}.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
