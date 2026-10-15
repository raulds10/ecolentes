import { useEffect, useState } from 'react';

/** Lo que queda elegido en la pantalla hasta que se guarda el pedido. */
export type Photo = { dataUrl: string; bytes: number };

/**
 * El lado más largo de la foto que se manda. Una foto de teléfono de 12
 * megapíxeles pesa cuatro megas y en el barrio no sube; achicada a 1600 píxeles
 * se lee un DNI o una receta sin problema y pesa unos pocos cientos de kilos.
 */
const MAX_SIDE = 1600;

/**
 * Achica la foto en el teléfono antes de mandarla. Se hace acá y no en el
 * servidor porque lo que falta en territorio es señal para subir, no espacio
 * para guardar.
 */
export async function shrink(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la foto en este navegador');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // JPG y no PNG: una foto en PNG pesa varias veces más y no se ve mejor.
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return { dataUrl, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) };
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/**
 * Un campo de foto, siempre optativo. Deja sacarla con la cámara o elegir una
 * del teléfono, la muestra achicada para poder ver si salió legible, y deja
 * sacarla de nuevo o quitarla.
 */
export function PhotoField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  /** Qué decir cuando todavía no hay foto. Sin esto, no se dice nada. */
  hint?: string;
  value: Photo | null;
  onChange: (photo: Photo | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    setWorking(true);
    try {
      onChange(await shrink(file));
    } catch {
      setError('No se pudo leer esa foto. Probá sacarla de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="photo-field">
      <label htmlFor={id}>{label}</label>
      {value ? (
        <div className="row between">
          <img className="photo-preview" src={value.dataUrl} alt={label} />
          <div className="actions">
            <label className="button secondary" htmlFor={id}>
              Sacar otra
            </label>
            <button type="button" className="secondary" onClick={() => onChange(null)}>
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <>
          {(working || hint) && <p className="muted">{working ? 'Preparando la foto…' : hint}</p>}
          <label className="button secondary" htmlFor={id}>
            {working ? 'Preparando…' : 'Sacar o elegir foto'}
          </label>
        </>
      )}
      <input
        id={id}
        type="file"
        accept="image/*"
        // En el teléfono abre la cámara directamente; en la computadora, los archivos.
        capture="environment"
        className="hidden"
        onChange={(e) => void take(e.target.files?.[0])}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Muestra una foto ya guardada, que se pide a la API de a una. */
export function SavedPhoto({
  label,
  load,
}: {
  label: string;
  load: () => Promise<{ dataUrl: string }>;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((found) => {
        if (!cancelled) setDataUrl(found.dataUrl);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!dataUrl) return <p className="muted">Abriendo {label.toLowerCase()}…</p>;

  return (
    <figure className="photo">
      {/* Se abre en una pestaña para poder agrandarla: un DNI en miniatura no se lee. */}
      <a href={dataUrl} target="_blank" rel="noreferrer">
        <img src={dataUrl} alt={label} />
      </a>
      <figcaption className="muted">{label}</figcaption>
    </figure>
  );
}
