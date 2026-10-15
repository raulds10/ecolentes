import { useState } from 'react';
import { Login } from './Login';
import { PersonDetail } from './PersonDetail';
import { CaseInbox } from './CaseInbox';
import { CaseDetail } from './CaseDetail';
import { NewCase } from './NewCase';
import { DeliveriesView, PendingView, PersonView, Reports } from './Reports';
import { Ecolentes } from './Ecolentes';
import { Users } from './Users';
import { PublicForm } from './PublicForm';
import { ROLE_LABELS, seesIdentityInReports, writeToken, type Role, type SessionUser } from './lib/api';

type Tab =
  | 'bandeja'
  | 'ecolentes'
  | 'nuevo'
  | 'indicadores'
  | 'entregas'
  | 'pendientes'
  | 'persona'
  | 'usuarios';

const REPORT_ROLES: Role[] = ['OPERATOR', 'OPHTHALMOLOGIST', 'DIRECTOR', 'SOCIAL_DESK', 'ADMIN'];

const TABS: { key: Tab; label: string; roles: Role[] | null }[] = [
  { key: 'bandeja', label: 'Expedientes', roles: null },
  { key: 'ecolentes', label: 'Ecolentes', roles: REPORT_ROLES },
  { key: 'nuevo', label: 'Pedido nuevo', roles: ['OPERATOR', 'SOCIAL_DESK', 'ADMIN'] },
  // La óptica no entra a los reportes: ve sus propios expedientes y nada más.
  { key: 'indicadores', label: 'Indicadores', roles: REPORT_ROLES },
  { key: 'entregas', label: 'Entregas', roles: REPORT_ROLES },
  { key: 'pendientes', label: 'Pendientes', roles: REPORT_ROLES },
  { key: 'persona', label: 'Por persona', roles: REPORT_ROLES.filter((role) => seesIdentityInReports(role)) },
  { key: 'usuarios', label: 'Usuarios', roles: ['ADMIN'] },
];

const BACK_LABEL: Record<Tab, string> = {
  bandeja: 'Volver a la bandeja',
  ecolentes: 'Volver a ecolentes',
  nuevo: 'Volver al pedido nuevo',
  indicadores: 'Volver a indicadores',
  entregas: 'Volver a entregas',
  pendientes: 'Volver a pendientes',
  persona: 'Volver a por persona',
  usuarios: 'Volver',
};

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
            backLabel={openPersonId ? 'Volver a la ficha' : BACK_LABEL[tab]}
            onBack={() => setOpenCaseId(null)}
            onOpenPerson={(personId) => {
              setOpenCaseId(null);
              setOpenPersonId(personId);
            }}
          />
        ) : openPersonId ? (
          <PersonDetail
            id={openPersonId}
            role={user.role}
            backLabel={BACK_LABEL[tab]}
            onBack={() => setOpenPersonId(null)}
            onOpenCase={setOpenCaseId}
          />
        ) : tab === 'ecolentes' ? (
          <Ecolentes role={user.role} onOpen={setOpenCaseId} />
        ) : tab === 'indicadores' ? (
          <Reports role={user.role} />
        ) : tab === 'entregas' ? (
          <DeliveriesView onOpen={setOpenCaseId} />
        ) : tab === 'pendientes' ? (
          <PendingView onOpen={setOpenCaseId} />
        ) : tab === 'persona' ? (
          <PersonView onOpen={setOpenCaseId} />
        ) : tab === 'usuarios' ? (
          <Users me={user} />
        ) : tab === 'nuevo' ? (
          <NewCase onCreated={setOpenCaseId} />
        ) : null}
      </main>
    </>
  );
}
