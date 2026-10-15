import { useState } from 'react';
import { Login } from './Login';
import { Search } from './Search';
import { PersonDetail } from './PersonDetail';
import { CaseInbox } from './CaseInbox';
import { CaseDetail } from './CaseDetail';
import { NewCase } from './NewCase';
import { Redes } from './Redes';
import { Reports } from './Reports';
import { Users } from './Users';
import { PublicForm } from './PublicForm';
import { ROLE_LABELS, writeToken, type Role, type SessionUser } from './lib/api';

type Tab = 'bandeja' | 'personas' | 'nuevo' | 'redes' | 'indicadores' | 'usuarios';

const TABS: { key: Tab; label: string; roles: Role[] | null }[] = [
  { key: 'bandeja', label: 'Expedientes', roles: null },
  { key: 'personas', label: 'Personas', roles: ['OPERATOR', 'OPHTHALMOLOGIST', 'DIRECTOR', 'SOCIAL_DESK', 'ADMIN'] },
  { key: 'nuevo', label: 'Pedido nuevo', roles: ['OPERATOR', 'SOCIAL_DESK', 'ADMIN'] },
  { key: 'redes', label: 'Redes', roles: ['SOCIAL_DESK', 'OPERATOR', 'ADMIN'] },
  // La óptica no entra a los reportes: ve sus propios expedientes y nada más.
  { key: 'indicadores', label: 'Indicadores', roles: ['OPERATOR', 'OPHTHALMOLOGIST', 'DIRECTOR', 'SOCIAL_DESK', 'ADMIN'] },
  { key: 'usuarios', label: 'Usuarios', roles: ['ADMIN'] },
];

/**
 * El formulario del vecino no pasa por el login. Vive en /solicitud, y también
 * responde a #/solicitud para que ande donde la página se sirve desde una ruta
 * que no se puede reescribir, como la versión de demostración.
 *
 * Se mira el final de la ruta y no la ruta entera, porque la aplicación puede
 * estar montada adentro de otro sitio: ahí el formulario es
 * /ecolentes/solicitud y sigue siendo el mismo formulario.
 */
function isPublicForm(): boolean {
  return (
    /\/solicitud\/?$/.test(window.location.pathname) ||
    window.location.hash.startsWith('#/solicitud')
  );
}

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<Tab>('bandeja');
  const [inboxView, setInboxView] = useState<'table' | 'kanban'>('table');
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);

  if (isPublicForm()) {
    return <PublicForm />;
  }

  if (!user) {
    return (
      <main className="centered">
        <Login onLogin={setUser} />
      </main>
    );
  }

  const tabs = TABS.filter((t) => t.roles === null || t.roles.includes(user.role));

  function go(next: Tab) {
    setTab(next);
    setOpenCaseId(null);
    setOpenPersonId(null);
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <strong>Ecolentes</strong>
          <span>Dirección de Salud</span>
        </div>
        <nav className="tabs" aria-label="Secciones">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={t.key === tab ? 'tab active' : 'tab'}
              aria-current={t.key === tab ? 'page' : undefined}
              onClick={() => go(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="session">
          <span className="who">
            {user.fullName} · {ROLE_LABELS[user.role]}
          </span>
          <button
            type="button"
            className="link"
            onClick={() => {
              writeToken(null);
              setUser(null);
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <main>
        {tab === 'bandeja' && (
          <div hidden={openCaseId !== null || openPersonId !== null}>
            <CaseInbox
              onOpen={setOpenCaseId}
              role={user.role}
              view={inboxView}
              onView={setInboxView}
            />
          </div>
        )}
        {openCaseId ? (
          <CaseDetail
            id={openCaseId}
            role={user.role}
            backLabel={
              openPersonId
                ? 'Volver a la ficha'
                : tab === 'personas'
                  ? 'Volver a personas'
                  : tab === 'redes'
                    ? 'Volver a redes'
                    : tab === 'indicadores'
                      ? 'Volver a indicadores'
                      : tab === 'nuevo'
                        ? 'Volver al pedido nuevo'
                        : 'Volver a la bandeja'
            }
            onBack={() => setOpenCaseId(null)}
            onOpenPerson={(personId) => {
              setOpenCaseId(null);
              setOpenPersonId(personId);
              setTab('personas');
            }}
          />
        ) : openPersonId ? (
          <PersonDetail
            id={openPersonId}
            role={user.role}
            onBack={() => setOpenPersonId(null)}
            onOpenCase={setOpenCaseId}
          />
        ) : tab === 'personas' ? (
          <Search onOpen={setOpenPersonId} onOpenCase={setOpenCaseId} />
        ) : tab === 'redes' ? (
          <Redes onOpen={setOpenCaseId} />
        ) : tab === 'indicadores' ? (
          <Reports role={user.role} onOpen={setOpenCaseId} />
        ) : tab === 'usuarios' ? (
          <Users me={user} />
        ) : tab === 'nuevo' ? (
          <NewCase onCreated={setOpenCaseId} />
        ) : null}
      </main>
    </>
  );
}
