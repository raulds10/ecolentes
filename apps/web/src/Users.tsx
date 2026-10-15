import { useEffect, useState } from 'react';
import {
  api,
  formatDate,
  ROLE_LABELS,
  type ManagedUser,
  type OpticianOption,
  type Role,
} from './lib/api';

const ROLES: Role[] = [
  'OPERATOR',
  'OPHTHALMOLOGIST',
  'OPTICIAN',
  'DIRECTOR',
  'SOCIAL_DESK',
  'ADMIN',
];

const EMPTY = {
  username: '',
  fullName: '',
  role: 'OPERATOR' as Role,
  opticianId: '',
};

/**
 * El alta de usuarios, que hasta ahora salía del seed. Es sólo del
 * administrador: define quién entra y con qué perfil ve datos de salud.
 */
export function Users({ me }: { me: { id: string } }) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [opticians, setOpticians] = useState<OpticianOption[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function refresh() {
    api
      .listUsers()
      .then(setUsers)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    refresh();
    api
      .listOpticians()
      .then(setOpticians)
      .catch(() => setOpticians([]));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await api.createUser({
        username: form.username.trim().toLowerCase(),
        fullName: form.fullName,
        role: form.role,
        opticianId: form.role === 'OPTICIAN' ? form.opticianId : undefined,
      });
      setCreated({ username: result.user.username, password: result.password });
      setForm(EMPTY);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function change(user: ManagedUser, input: Parameters<typeof api.updateUser>[1]) {
    setError(null);
    try {
      await api.updateUser(user.id, input);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resetPassword(user: ManagedUser) {
    setError(null);
    try {
      const { password } = await api.resetUserPassword(user.id);
      setCreated({ username: user.username, password });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="stack">
      <header className="page-head">
        <h2>Usuarios</h2>
        <p className="muted">Quién entra, y con qué perfil ve los datos de salud.</p>
      </header>

      <form className="card user-form" onSubmit={create}>
        <h3>Dar de alta</h3>
        <div className="row">
          <label>
            Usuario
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="jperez"
              required
            />
          </label>
          <label>
            Nombre y apellido
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Juana Pérez"
              required
            />
          </label>
          <label>
            Perfil
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          {form.role === 'OPTICIAN' && (
            <label>
              Óptica
              <select
                value={form.opticianId}
                onChange={(e) => setForm({ ...form, opticianId: e.target.value })}
                required
              >
                <option value="">Elegí una</option>
                {opticians.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Creando…' : 'Crear usuario'}
        </button>
      </form>

      {created && (
        <div className="notice">
          <p>
            Contraseña de <strong>{created.username}</strong>: <code>{created.password}</code>
          </p>
          <p className="muted">
            Se muestra una sola vez. Pasásela por un canal seguro; al entrar, el sistema le va a
            pedir que la cambie.
          </p>
          <button type="button" className="link" onClick={() => setCreated(null)}>
            Ya la anoté
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {/* Como en los reportes: en el teléfono la tabla se desliza en lugar de
          apretar las columnas hasta que no se lean. */}
      <div className="card stack-tight">
        <table className="report">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Perfil</th>
              <th>Último ingreso</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((user) => (
              <tr key={user.id} className={user.active ? undefined : 'muted'}>
                <td>{user.username}</td>
                <td>{user.fullName}</td>
                <td>
                  <select
                    value={user.role}
                    disabled={user.id === me.id}
                    onChange={(e) => change(user, { role: e.target.value as Role })}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  {user.optician && <span className="muted"> · {user.optician.name}</span>}
                </td>
                <td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Nunca entró'}</td>
                <td>
                  {!user.active
                    ? 'Dado de baja'
                    : user.mustChangePassword
                      ? 'Tiene que cambiar la contraseña'
                      : 'Activo'}
                </td>
                <td className="actions">
                  <button type="button" className="link" onClick={() => resetPassword(user)}>
                    Nueva contraseña
                  </button>
                  {user.id !== me.id && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => change(user, { active: !user.active })}
                    >
                      {user.active ? 'Dar de baja' : 'Reactivar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Los usuarios no se borran: se dan de baja. Borrarlos dejaría sin autor los expedientes y la
        auditoría que ya firmaron.
      </p>
    </section>
  );
}
