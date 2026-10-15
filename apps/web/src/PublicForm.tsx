import { useState } from 'react';
import { api } from './lib/api';

const EMPTY = { dni: '', firstName: '', lastName: '', phone: '', neighborhood: '', reason: '' };

/**
 * El formulario que ve el vecino, sin entrar al sistema. Pide lo mínimo y no
 * pregunta nada clínico: lo completa una persona sola, sin nadie que le explique
 * para qué sirve cada dato. Tampoco muestra nunca si ya existe un pedido, porque
 * eso convertiría el link en una forma de averiguar datos de otra persona.
 */
export function PublicForm() {
  const [form, setForm] = useState(EMPTY);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const response = await api.submitPublicForm({
        dni: form.dni,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        neighborhood: form.neighborhood || undefined,
        reason: form.reason || undefined,
      });
      setSent(response.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <main className="centered">
        <div className="card public">
          <h1>Listo</h1>
          <p>{sent}</p>
          <p className="muted">Ya podés cerrar esta página.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="centered">
      <form
        className="card public stack-tight"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1>Pedido de anteojos</h1>
        <p className="muted">
          Programa Ecolentes · Dirección de Salud de la Municipalidad de San Miguel de Tucumán.
        </p>
        <p>Dejanos tus datos y te llamamos para darte un turno con el oftalmólogo.</p>

        <div>
          <label htmlFor="p-dni">DNI</label>
          <input
            id="p-dni"
            value={form.dni}
            inputMode="numeric"
            placeholder="Sin puntos"
            onChange={(e) => set('dni', e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="p-apellido">Apellido</label>
          <input
            id="p-apellido"
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="p-nombre">Nombre</label>
          <input
            id="p-nombre"
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="p-tel">Teléfono</label>
          <input
            id="p-tel"
            value={form.phone}
            inputMode="tel"
            placeholder="Donde te podamos ubicar"
            onChange={(e) => set('phone', e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="p-barrio">Barrio</label>
          <input
            id="p-barrio"
            value={form.neighborhood}
            onChange={(e) => set('neighborhood', e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="p-motivo">Contanos qué te pasa con la vista</label>
          <input
            id="p-motivo"
            value={form.reason}
            placeholder="Ej.: veo borroso de lejos"
            onChange={(e) => set('reason', e.target.value)}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Enviando…' : 'Enviar el pedido'}
          </button>
        </div>
        <p className="muted">
          Tus datos los usa sólo la Dirección de Salud para este programa.
        </p>
      </form>
    </main>
  );
}
