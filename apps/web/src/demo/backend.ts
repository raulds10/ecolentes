import {
  ageOf,
  attachmentBelongsToPerson,
  canMove,
  canUploadAttachment,
  glassesKindsFromText,
  isMinor,
  isOverdue,
  pairsFromText,
  parsePrescription,
  seesAttachment,
  STAGE_RULES,
} from '@ecolentes/shared';
import { buildState, type DemoCaseRecord, type DemoState } from './state';
import { ApiError, type AttachmentKind, type CaseStage, type Role } from '../lib/api';

/**
 * Una versión de demostración que corre entera en el navegador: no hay servidor
 * ni base de datos. Responde las mismas rutas que la API real con los datos de
 * ejemplo, para que se pueda recorrer el circuito completo desde un link.
 *
 * Las reglas del circuito (quién mueve qué etapa y con qué plazo) salen de
 * `@ecolentes/shared`, las mismas que usa la API, así que acá no se vuelven a
 * escribir. Lo que sí es de mentira son los datos y la sesión.
 *
 * Nada de esto entra en el build de producción: se carga sólo cuando se compila
 * con VITE_DEMO=1.
 */

const DEMO_PASSWORD = 'ecolentes';

type Handler = <T>(path: string, init: RequestInit) => Promise<T>;

/**
 * Un error de la demostración. Hereda de ApiError porque las pantallas miran el
 * código: sin eso, en la demostración un DNI que no existe se veía como un
 * error en vez de abrir el formulario de ficha nueva.
 */
class DemoError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status, null);
  }
}

const NOMINAL: Role[] = ['OPERATOR', 'OPHTHALMOLOGIST', 'SOCIAL_DESK', 'ADMIN'];
const CLOSED: CaseStage[] = ['DELIVERED', 'CLOSED'];
const IN_HOUSE: CaseStage[] = ['RECEIVED', 'READY_FOR_PICKUP'];
const AT_OPTICIAN: CaseStage[] = ['OPTICIAN_QUOTE', 'APPROVAL', 'PRODUCTION'];

function accents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function digits(text: string): string {
  return text.replace(/\D/g, '');
}

export function installDemoBackend(): void {
  const state = buildState();
  let session = state.users[0]!;
  // Las imágenes de la demostración, en memoria: se pierden al recargar.
  const images = new Map<string, string>();
  let attachmentCount = 0;

  const bodyOf = (init: RequestInit): Record<string, unknown> =>
    init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const withDelay = (c: DemoCaseRecord) => ({
    ...c,
    overdue: isOverdue(c.stage, new Date(c.stageSince)),
  });

  function requireCase(id: string): DemoCaseRecord {
    const found = state.cases.find((c) => c.id === id);
    if (!found) throw new DemoError('No existe ese expediente', 404);
    if (session.role === 'OPTICIAN' && found.optician?.id !== session.opticianId) {
      throw new DemoError('No existe ese expediente', 404);
    }
    return found;
  }

  function note(c: DemoCaseRecord, text: string, toStage: CaseStage | null = null) {
    c.events = [
      {
        id: `e-${Math.random().toString(36).slice(2)}`,
        fromStage: null,
        toStage,
        hold: null,
        note: text,
        username: session.username,
        occurredAt: new Date().toISOString(),
      },
      ...c.events,
    ];
  }

  function move(c: DemoCaseRecord, to: CaseStage, text: string) {
    if (!canMove(c.stage, to, session.role)) {
      throw new DemoError(
        STAGE_RULES[c.stage].next.includes(to)
          ? 'Tu rol no puede mover el expediente desde esta etapa'
          : `Desde ${c.stage} no se puede pasar a ${to}`,
        403,
      );
    }
    if (to === 'DELIVERED' && !c.delivery) {
      throw new DemoError('Registrá la entrega antes de marcarlo entregado', 400);
    }
    if (to === 'OPTICIAN_QUOTE' && c.stage === 'ASSESSMENT' && !c.prescription?.validatedAt) {
      throw new DemoError(
        'La receta tiene que estar validada por el profesional antes de ir a la óptica',
        400,
      );
    }
    const from = c.stage;
    c.stage = to;
    c.stageSince = new Date().toISOString();
    c.hold = null;
    c.holdNote = null;
    c.events = [
      {
        id: `e-${Math.random().toString(36).slice(2)}`,
        fromStage: from,
        toStage: to,
        hold: null,
        note: text || null,
        username: session.username,
        occurredAt: new Date().toISOString(),
      },
      ...c.events,
    ];
  }

  function newCase(input: {
    personId: string;
    channel: DemoCaseRecord['channel'];
    socialNetwork?: DemoCaseRecord['socialNetwork'];
    reason?: string;
    firstNote: string;
  }): DemoCaseRecord {
    const person = state.people.find((p) => p.id === input.personId);
    if (!person) throw new DemoError('No existe esa ficha de persona', 404);

    const created: DemoCaseRecord = {
      id: `c-${state.nextCode}`,
      code: `ECO-${String(state.nextCode++).padStart(4, '0')}`,
      stage: 'REQUEST',
      hold: null,
      holdNote: null,
      channel: input.channel,
      socialNetwork: input.socialNetwork ?? null,
      pairs: 1,
      stageSince: new Date().toISOString(),
      overdue: false,
      person,
      // Hoy se trabaja con una sola óptica, así que se asigna sola.
      optician: { id: state.opticianId, name: state.opticianName },
      reason: input.reason || null,
      prescription: null,
      quotes: [],
      glasses: [],
      attachments: [],
      delivery: null,
      events: [],
      createdAt: new Date().toISOString(),
    };
    note(created, input.firstNote, 'REQUEST');
    state.cases = [created, ...state.cases];
    return created;
  }

  /**
   * El estado de la persona en una línea, igual que lo devuelve la API: si pidió
   * anteojos, cuántos recibió y qué expediente tiene en curso.
   */
  function summarize(person: DemoCaseRecord['person']) {
    const mine = state.cases
      .filter((c) => c.person.id === person.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const delivered = mine.flatMap((c) => c.glasses).filter((pair) => pair.deliveredAt);
    const open = mine.find((c) => c.stage !== 'CLOSED') ?? null;

    return {
      age: ageOf(person),
      isMinor: isMinor(person),
      cases: mine.length,
      pairsRequested: mine.reduce((total, c) => total + c.pairs, 0),
      pairsDelivered: delivered.length,
      lastDeliveryAt:
        delivered.length > 0
          ? delivered.map((pair) => pair.deliveredAt!).sort().reverse()[0]!
          : null,
      openCase: open && {
        id: open.id,
        code: open.code,
        stage: open.stage,
        hold: open.hold,
        stageSince: open.stageSince,
        overdue: isOverdue(open.stage, new Date(open.stageSince)),
        glasses: open.glasses,
      },
    };
  }

  /** Los anteojos nacen cuando Dirección aprueba: ahí recién tienen código. */
  function issueGlasses(c: DemoCaseRecord) {
    if (c.glasses.length > 0) return;
    const kinds = glassesKindsFromText(c.prescription?.rawText ?? '');
    c.glasses = kinds.map((kind) => ({
      code: `ANT-${String(state.nextGlassesCode++).padStart(4, '0')}`,
      kind,
      deliveredAt: null,
    }));
  }

  function openCaseOf(dni: string) {
    return state.cases.find((c) => c.person.dni === dni && !CLOSED.includes(c.stage));
  }

  function upsertPerson(input: {
    dni: string;
    firstName: string;
    lastName: string;
    phone?: string;
    neighborhood?: string;
    identityVerified: boolean;
  }) {
    const dni = digits(input.dni);
    const existing = state.people.find((p) => p.dni === dni);
    if (existing) {
      if (!existing.phone && input.phone) existing.phone = input.phone;
      if (!existing.neighborhood && input.neighborhood) existing.neighborhood = input.neighborhood;
      if (input.identityVerified) existing.identityVerified = true;
      return existing;
    }
    const person = {
      id: `p-${dni}`,
      dni,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: null,
      ageAtIntake: null,
      ageTakenAt: null,
      sex: null,
      phone: input.phone ?? null,
      address: null,
      neighborhood: input.neighborhood ?? null,
      representativeName: null,
      representativePhone: null,
      representativeBond: null,
      notes: null,
      identityVerified: input.identityVerified,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.people = [person, ...state.people];
    return person;
  }

  const sumPairs = (list: { pairs: number }[]) => list.reduce((a, c) => a + c.pairs, 0);

  /** Los anteojos de un expediente que todavía no se entregaron. */
  const pendingGlasses = (c: DemoCaseRecord) => c.glasses.filter((pair) => !pair.deliveredAt);

  /**
   * Cuántos pares sin entregar tiene el expediente. Se cuentan los anteojos
   * numerados; la columna `pairs` queda de respaldo para un expediente al que
   * nunca se le emitieron.
   */
  const pairsOf = (c: DemoCaseRecord) => pendingGlasses(c).length || c.pairs;

  const stockPairs = (list: DemoCaseRecord[]) => list.reduce((a, c) => a + pairsOf(c), 0);

  function groupBy<T>(list: T[], key: (item: T) => string): [string, T[]][] {
    const map = new Map<string, T[]>();
    for (const item of list) {
      const k = key(item);
      const bucket = map.get(k);
      if (bucket) bucket.push(item);
      else map.set(k, [item]);
    }
    return [...map.entries()];
  }

  const handler: Handler = async <T,>(path: string, init: RequestInit): Promise<T> => {
    // Un respiro, para que se note que la pantalla espera una respuesta.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const [route, query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = bodyOf(init);
    const result = route ? dispatch(route, method, params, body) : null;
    if (result === null) throw new DemoError(`La demostración no cubre ${method} ${route}`, 404);
    return result as T;
  };

  function dispatch(
    route: string,
    method: string,
    params: URLSearchParams,
    body: Record<string, unknown>,
  ): unknown {
    // --- Sesión
    if (route === '/auth/login') {
      const user = state.users.find((u) => u.username === str(body.username));
      if (!user || str(body.password) !== DEMO_PASSWORD) {
        throw new DemoError('Usuario o contraseña incorrectos', 401);
      }
      session = user;
      return { accessToken: `demo-${user.username}`, user, mustChangePassword: false };
    }

    // --- Personas
    if (route === '/personas' && method === 'GET') {
      const q = params.get('q') ?? '';
      const d = digits(q);
      const text = accents(q);
      const found = !q.trim()
        ? [...state.people]
        : state.people.filter(
            (p) =>
              (d.length >= 3 && p.dni.includes(d)) ||
              accents(`${p.lastName} ${p.firstName}`).includes(text),
          );
      found.sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es'),
      );
      const skip = Number(params.get('skip') ?? 0) || 0;
      const take = Number(params.get('take') ?? 20) || 20;
      return found.slice(skip, skip + take).map((p) => ({ ...p, summary: summarize(p) }));
    }
    if (route.startsWith('/personas/por-dni/')) {
      const found = state.people.find((p) => p.dni === digits(route.split('/').pop() ?? ''));
      if (!found) throw new DemoError('No existe esa ficha', 404);
      return found;
    }
    if (route.endsWith('/historial')) {
      return [
        {
          id: 'a-1',
          action: 'VIEW',
          username: session.username,
          changes: null,
          occurredAt: new Date().toISOString(),
        },
      ];
    }
    if (route.startsWith('/personas/') && method === 'GET') {
      const found = state.people.find((p) => p.id === route.split('/')[2]);
      if (!found) throw new DemoError('No existe esa ficha', 404);
      const front = state.cases
        .flatMap((c) => c.attachments)
        .find((a) => a.kind === 'DNI_FRONT' && a.personId === found.id);
      return {
        ...found,
        dniFrontId: seesAttachment(session.role, 'DNI_FRONT') ? (front?.id ?? null) : null,
      };
    }
    if (route === '/personas' && method === 'POST') {
      const dni = digits(str(body.dni));
      if (state.people.some((p) => p.dni === dni)) {
        throw new DemoError('Ya existe una ficha con ese DNI', 409);
      }
      return upsertPerson({
        dni,
        firstName: str(body.firstName),
        lastName: str(body.lastName),
        phone: str(body.phone) || undefined,
        neighborhood: str(body.neighborhood) || undefined,
        identityVerified: true,
      });
    }

    // --- Expedientes
    if (route === '/expedientes' && method === 'GET') {
      let list = state.cases.map(withDelay);
      const stage = params.get('stage');
      if (stage) list = list.filter((c) => c.stage === stage);
      const q = params.get('q');
      if (q?.trim()) {
        const d = digits(q);
        const text = accents(q);
        list = list.filter(
          (c) =>
            c.code.toLowerCase().includes(q.toLowerCase()) ||
            c.glasses.some((pair) => pair.code.toLowerCase().includes(q.toLowerCase())) ||
            accents(`${c.person.lastName} ${c.person.firstName}`).includes(text) ||
            (d.length >= 3 && c.person.dni.includes(d)),
        );
      }
      const neighborhood = params.get('neighborhood');
      if (neighborhood) {
        list = list.filter(
          (c) => accents(c.person.neighborhood ?? '') === accents(neighborhood),
        );
      }
      if (session.role === 'OPTICIAN') {
        list = list.filter(
          (c) => c.optician?.id === session.opticianId && AT_OPTICIAN.includes(c.stage),
        );
      }
      if (params.get('overdue') === 'true') list = list.filter((c) => c.overdue);
      return [...list].sort((a, b) => a.stageSince.localeCompare(b.stageSince));
    }
    // --- Fotos del DNI y de la receta
    if (route === '/adjuntos' && method === 'POST') {
      const kind = body.kind as AttachmentKind;
      if (!canUploadAttachment(session.role, kind)) {
        throw new DemoError('Tu rol no puede cargar esta imagen', 403);
      }
      const dataUrl = str(body.dataUrl);
      // En la demostración las fotos viven en memoria y se pierden al recargar:
      // no hay servidor donde guardarlas.
      const saved = {
        id: `adj-${++attachmentCount}`,
        kind,
        mimeType: dataUrl.slice(5, dataUrl.indexOf(';')),
        bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
        createdAt: new Date().toISOString(),
        personId: str(body.personId) || null,
        caseId: str(body.caseId) || null,
      };
      images.set(saved.id, dataUrl);

      // Una foto nueva reemplaza a la anterior del mismo tipo, igual que en la API.
      const targets = attachmentBelongsToPerson(kind)
        ? state.cases.filter((c) => c.person.id === saved.personId)
        : state.cases.filter((c) => c.id === saved.caseId);
      for (const c of state.cases) {
        c.attachments = c.attachments.filter(
          (a) => !(a.kind === kind && (a.personId === saved.personId || a.caseId === saved.caseId)),
        );
      }
      for (const c of targets) c.attachments = [...c.attachments, saved];
      return saved;
    }
    const attachmentMatch = /^\/adjuntos\/([^/]+)$/.exec(route);
    if (attachmentMatch && method === 'GET') {
      const id = attachmentMatch[1]!;
      const dataUrl = images.get(id);
      const saved = state.cases.flatMap((c) => c.attachments).find((a) => a.id === id);
      if (!dataUrl || !saved) throw new DemoError('No existe esa imagen', 404);
      if (!seesAttachment(session.role, saved.kind)) {
        throw new DemoError('Tu rol no puede ver esta imagen', 403);
      }
      return { ...saved, dataUrl };
    }

    if (route === '/expedientes' && method === 'POST') {
      return withDelay(
        newCase({
          personId: str(body.personId),
          channel: body.channel as DemoCaseRecord['channel'],
          reason: str(body.reason),
          firstNote: 'Solicitud cargada',
        }),
      );
    }

    const caseMatch = /^\/expedientes\/([^/]+)(\/.*)?$/.exec(route);
    if (caseMatch) {
      const found = requireCase(caseMatch[1]!);
      const action = caseMatch[2];

      if (!action && method === 'GET') return withDelay(found);

      if (action === '/receta') {
        const rawText = str(body.rawText);
        const validated = session.role === 'OPHTHALMOLOGIST';
        const parsed = parsePrescription(rawText);
        const text = (value: number | null) => (value === null ? null : value.toFixed(2));
        found.prescription = {
          rawText,
          farRightSphere: text(parsed.farRightSphere),
          farRightCylinder: text(parsed.farRightCylinder),
          farRightAxis: parsed.farRightAxis,
          farLeftSphere: text(parsed.farLeftSphere),
          farLeftCylinder: text(parsed.farLeftCylinder),
          farLeftAxis: parsed.farLeftAxis,
          nearAddition: text(parsed.nearAddition),
          validatedAt: validated ? new Date().toISOString() : null,
        };
        found.pairs = pairsFromText(rawText);
        note(
          found,
          validated
            ? 'Receta cargada y validada por el profesional'
            : 'Receta cargada, falta que la valide el profesional',
        );
        return found.prescription;
      }

      if (action === '/propuesta') {
        if (found.stage !== 'OPTICIAN_QUOTE') {
          throw new DemoError(
            'Sólo se puede cargar una propuesta cuando el expediente está en propuesta óptica',
            400,
          );
        }
        const version = (found.quotes[0]?.version ?? 0) + 1;
        const quote = {
          id: `q-${Math.random().toString(36).slice(2)}`,
          version,
          lenses: str(body.lenses),
          frame: str(body.frame),
          leadDays: typeof body.leadDays === 'number' ? body.leadDays : null,
          amount: typeof body.amount === 'number' ? body.amount.toFixed(2) : null,
          notes: str(body.notes) || null,
          status: 'SUBMITTED' as const,
          decisionNote: null,
          decidedAt: null,
          createdAt: new Date().toISOString(),
        };
        found.quotes = [quote, ...found.quotes];
        move(found, 'APPROVAL', `Propuesta versión ${version}`);
        return quote;
      }

      if (action === '/aprobacion') {
        if (found.stage !== 'APPROVAL') {
          throw new DemoError('El expediente no está esperando aprobación', 400);
        }
        const approve = body.approve === true;
        const text = str(body.note);
        if (!approve && !text) {
          throw new DemoError('Para observar la propuesta hay que decir qué corregir', 400);
        }
        const last = found.quotes[0];
        if (!last) throw new DemoError('No hay ninguna propuesta cargada', 400);
        last.status = approve ? 'APPROVED' : 'OBSERVED';
        last.decisionNote = text || null;
        last.decidedAt = new Date().toISOString();
        move(found, approve ? 'PRODUCTION' : 'OPTICIAN_QUOTE', approve ? 'Propuesta aprobada' : `Observada: ${text}`);
        if (approve) issueGlasses(found);
        if (!approve) {
          found.hold = 'QUOTE_OBSERVED';
          found.holdNote = text || null;
        }
        return withDelay(found);
      }

      if (action === '/entrega') {
        const porRepresentante = body.isRepresentative === true;
        const motivo = str(body.note);
        // Los anteojos de un menor se le entregan a su tutor. Si igual los retira
        // el chico, se puede, pero hay que escribir por qué.
        if (isMinor(found.person) === true && !porRepresentante && !motivo) {
          throw new DemoError(
            'Es menor de edad: los anteojos se le entregan a su padre, madre o tutor. ' +
              'Si igual los retira la propia persona, escribí por qué',
            400,
          );
        }
        found.delivery = {
          deliveredAt: str(body.deliveredAt) || new Date().toISOString(),
          receivedBy: str(body.receivedBy),
          receivedByDni: porRepresentante ? digits(str(body.receivedByDni)) || null : null,
          isRepresentative: porRepresentante,
          note: motivo || null,
        };
        for (const pair of found.glasses) pair.deliveredAt = found.delivery.deliveredAt;
        move(found, 'DELIVERED', `Recibió ${found.delivery.receivedBy}`);
        return found.delivery;
      }

      if (action === '/etapa') {
        move(found, body.to as CaseStage, str(body.note));
        return withDelay(found);
      }

      if (action === '/freno') {
        found.hold = body.hold as DemoCaseRecord['hold'];
        found.holdNote = str(body.note) || null;
        note(found, str(body.note) || 'Expediente frenado');
        return withDelay(found);
      }

      if (action === '/optica') {
        found.optician = { id: state.opticianId, name: state.opticianName };
        note(found, `Óptica asignada: ${state.opticianName}`);
        return withDelay(found);
      }
    }

    // --- Ingresos por redes y formulario público
    if (route === '/ingresos/publico' && method === 'POST') {
      const dni = digits(str(body.dni));
      if (dni.length < 7) throw new DemoError('Escribí tu DNI, sin puntos', 400);
      // Siempre la misma respuesta, exista o no un pedido abierto.
      if (!openCaseOf(dni)) {
        const person = upsertPerson({
          dni,
          firstName: str(body.firstName),
          lastName: str(body.lastName),
          phone: str(body.phone) || undefined,
          neighborhood: str(body.neighborhood) || undefined,
          identityVerified: false,
        });
        newCase({
          personId: person.id,
          channel: 'PUBLIC_FORM',
          reason: str(body.reason),
          firstNote: 'Solicitud enviada desde el formulario público. Identidad por verificar',
        });
      }
      return { message: 'Recibimos tu pedido. Te vamos a llamar al teléfono que dejaste.' };
    }

    if (route === '/ingresos/redes' && method === 'GET') {
      return state.cases
        .filter((c) => c.channel === 'SOCIAL_MEDIA' || c.channel === 'PUBLIC_FORM')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 30)
        .map((c) => ({
          id: c.id,
          code: c.code,
          stage: c.stage,
          hold: c.hold,
          channel: c.channel,
          socialNetwork: c.socialNetwork,
          reason: c.reason,
          createdAt: c.createdAt,
          person: {
            id: c.person.id,
            firstName: c.person.firstName,
            lastName: c.person.lastName,
            dni: c.person.dni,
            phone: c.person.phone,
            neighborhood: c.person.neighborhood,
            identityVerified: c.person.identityVerified,
          },
        }));
    }

    if (route === '/ingresos/redes' && method === 'POST') {
      const dni = digits(str(body.dni));
      if (dni.length < 7) throw new DemoError('El DNI tiene que tener entre 7 y 8 dígitos', 400);
      const existing = openCaseOf(dni);
      if (existing && body.force !== true) {
        return {
          created: false,
          duplicate: {
            caseId: existing.id,
            code: existing.code,
            stage: existing.stage,
            createdAt: existing.createdAt,
          },
          case: null,
        };
      }
      const person = upsertPerson({
        dni,
        firstName: str(body.firstName),
        lastName: str(body.lastName),
        phone: str(body.phone) || undefined,
        neighborhood: str(body.neighborhood) || undefined,
        identityVerified: true,
      });
      const created = newCase({
        personId: person.id,
        channel: 'SOCIAL_MEDIA',
        socialNetwork: body.socialNetwork as DemoCaseRecord['socialNetwork'],
        reason: str(body.reason),
        firstNote: 'Pedido cargado desde el panel de redes',
      });
      if (str(body.notes)) note(created, `Notas de la conversación: ${str(body.notes)}`);
      return {
        created: true,
        duplicate: existing
          ? {
              caseId: existing.id,
              code: existing.code,
              stage: existing.stage,
              createdAt: existing.createdAt,
            }
          : null,
        case: { id: created.id, code: created.code },
      };
    }

    const verify = /^\/ingresos\/personas\/([^/]+)\/verificar-identidad$/.exec(route);
    if (verify) {
      const person = state.people.find((p) => p.id === verify[1]);
      if (!person) throw new DemoError('No existe esa ficha', 404);
      person.identityVerified = true;
      return person;
    }

    // --- Usuarios
    if (route.startsWith('/usuarios')) {
      if (session.role !== 'ADMIN') {
        throw new DemoError('Tu rol no tiene permiso para esta acción', 403);
      }

      const shown = (u: DemoState['users'][number]) => ({
        ...u,
        mustChangePassword: false,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        optician: u.opticianId ? { id: u.opticianId, name: state.opticianName } : null,
      });

      if (route === '/usuarios/opticas') {
        return [{ id: state.opticianId, name: state.opticianName }];
      }

      if (route === '/usuarios' && method === 'GET') {
        return state.users.map(shown);
      }

      if (route === '/usuarios' && method === 'POST') {
        const username = str(body.username).toLowerCase();
        if (state.users.some((u) => u.username === username)) {
          throw new DemoError(`Ya hay un usuario que se llama "${username}"`, 409);
        }
        const role = str(body.role) as Role;
        if (role === 'OPTICIAN' && !str(body.opticianId)) {
          throw new DemoError(
            'El perfil Óptica necesita que elijas a qué óptica pertenece',
            400,
          );
        }
        const user = {
          id: `u-${username}`,
          username,
          fullName: str(body.fullName),
          role,
          opticianId: role === 'OPTICIAN' ? state.opticianId : null,
          active: true,
        };
        state.users = [...state.users, user];
        // En la demostración la contraseña es siempre la misma, así que se
        // muestra esa: no hay dónde guardar una distinta por usuario.
        return { user: shown(user), password: DEMO_PASSWORD };
      }

      const userMatch = /^\/usuarios\/([^/]+)(\/contrasena)?$/.exec(route);
      const user = userMatch ? state.users.find((u) => u.id === userMatch[1]) : undefined;
      if (!user) throw new DemoError('Ese usuario no existe', 404);

      if (userMatch?.[2]) return { password: DEMO_PASSWORD };

      if (method === 'PATCH') {
        const quitandoAdmin =
          user.role === 'ADMIN' && (body.role !== undefined || body.active === false);
        if (user.id === session.id && (body.active === false || body.role !== undefined)) {
          throw new DemoError(
            'No podés cambiarte el perfil ni darte de baja a vos mismo. Pedíselo a otro administrador',
            400,
          );
        }
        if (
          quitandoAdmin &&
          state.users.filter((u) => u.role === 'ADMIN' && u.active && u.id !== user.id).length === 0
        ) {
          throw new DemoError('Es el único administrador activo. Creá otro antes de cambiar este', 400);
        }
        if (body.fullName !== undefined) user.fullName = str(body.fullName);
        if (body.active !== undefined) user.active = body.active === true;
        if (body.role !== undefined) {
          user.role = str(body.role) as Role;
          user.opticianId = user.role === 'OPTICIAN' ? state.opticianId : null;
        }
        return shown(user);
      }
    }

    // --- Reportes
    if (route.startsWith('/reportes/')) {
      if (session.role === 'OPTICIAN') {
        throw new DemoError('Tu rol no tiene permiso para esta acción', 403);
      }
      const nominal = NOMINAL.includes(session.role);
      const all = state.cases.map(withDelay);

      if (route === '/reportes/resumen') {
        const shareable = params.get('shareable') === 'true';
        const hide = (n: number) => (shareable && n > 0 && n < 3 ? null : n);
        const open = all.filter((c) => !CLOSED.includes(c.stage));
        const delivered = all.filter((c) => CLOSED.includes(c.stage));
        const stages: CaseStage[] = [
          'REQUEST',
          'ASSESSMENT',
          'OPTICIAN_QUOTE',
          'APPROVAL',
          'PRODUCTION',
          'RECEIVED',
          'READY_FOR_PICKUP',
          'DELIVERED',
          'CLOSED',
        ];
        return {
          shareable,
          kpis: {
            requests: all.length,
            people: new Set(all.map((c) => c.person.dni)).size,
            pairs: sumPairs(all),
            deliveredCases: delivered.length,
            deliveredPairs: sumPairs(delivered),
            approvedNotDelivered: all.filter(
              (c) => c.stage === 'PRODUCTION' || IN_HOUSE.includes(c.stage),
            ).length,
            open: open.length,
            overdue: open.filter((c) => c.overdue).length,
            onHold: open.filter((c) => c.hold).length,
            unverifiedIdentity: all.filter((c) => !c.person.identityVerified).length,
          },
          byStage: stages.map((stage) => {
            const list = all.filter((c) => c.stage === stage);
            return {
              stage,
              total: list.length,
              pairs: sumPairs(list),
              overdue: list.filter((c) => c.overdue).length,
            };
          }),
          byChannel: groupBy(all, (c) => c.channel).map(([channel, list]) => ({
            channel,
            total: list.length,
            pairs: sumPairs(list),
            overdue: list.filter((c) => c.overdue).length,
          })),
          byNeighborhood: groupBy(all, (c) => c.person.neighborhood ?? 'Sin barrio cargado')
            .map(([neighborhood, list]) => {
              const openHere = list.filter((c) => !CLOSED.includes(c.stage));
              return {
                neighborhood,
                open: hide(openHere.length),
                delivered: hide(list.filter((c) => CLOSED.includes(c.stage)).length),
                overdue: hide(openHere.filter((c) => c.overdue).length),
              };
            })
            .sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, 'es')),
          byOptician: groupBy(
            all.filter((c) => AT_OPTICIAN.includes(c.stage)),
            (c) => c.optician?.name ?? 'Sin óptica asignada',
          ).map(([optician, list]) => ({
            optician,
            total: list.length,
            pairs: sumPairs(list),
            overdue: list.filter((c) => c.overdue).length,
          })),
        };
      }

      if (route === '/reportes/entregas') {
        const rows = all
          .filter((c) => c.delivery)
          .sort((a, b) => b.delivery!.deliveredAt.localeCompare(a.delivery!.deliveredAt));
        return {
          nominal,
          totals: {
            deliveries: rows.length,
            pairs: sumPairs(rows),
            byRepresentative: rows.filter((c) => c.delivery!.isRepresentative).length,
            unverifiedIdentity: rows.filter((c) => !c.person.identityVerified).length,
          },
          rows: rows.map((c) => ({
            caseId: c.id,
            code: c.code,
            deliveredAt: c.delivery!.deliveredAt,
            pairs: c.pairs,
            channel: c.channel,
            neighborhood: c.person.neighborhood,
            identityVerified: c.person.identityVerified,
            isRepresentative: c.delivery!.isRepresentative,
            handedBy: 'Carolina Suárez',
            note: null,
            person: nominal
              ? { name: `${c.person.lastName}, ${c.person.firstName}`, dni: c.person.dni }
              : null,
            receivedBy: nominal
              ? c.delivery!.receivedBy
              : c.delivery!.isRepresentative
                ? 'Representante'
                : 'Titular',
          })),
        };
      }

      if (route === '/reportes/pendientes') {
        const row = (c: DemoCaseRecord & { overdue: boolean }) => ({
          caseId: c.id,
          code: c.code,
          stage: c.stage,
          hold: c.hold,
          pairs: pairsOf(c),
          glasses: pendingGlasses(c).map((pair) => ({ code: pair.code, kind: pair.kind })),
          neighborhood: c.person.neighborhood,
          stageSince: c.stageSince,
          overdue: c.overdue,
          optician: c.optician?.name ?? null,
          person: nominal
            ? { name: `${c.person.lastName}, ${c.person.firstName}`, dni: c.person.dni }
            : null,
        });
        const inHouse = all.filter((c) => IN_HOUSE.includes(c.stage));
        const atOptician = all.filter((c) => c.stage === 'PRODUCTION');
        const ready = inHouse.filter((c) => c.stage === 'READY_FOR_PICKUP');
        const toCheck = inHouse.filter((c) => c.stage === 'RECEIVED');
        return {
          nominal,
          totals: {
            inHousePairs: stockPairs(inHouse),
            inHouseCases: inHouse.length,
            readyPairs: stockPairs(ready),
            readyCases: ready.length,
            toCheckPairs: stockPairs(toCheck),
            toCheckCases: toCheck.length,
            atOpticianPairs: stockPairs(atOptician),
            atOpticianCases: atOptician.length,
            overdue: [...inHouse, ...atOptician].filter((c) => c.overdue).length,
          },
          byNeighborhood: groupBy(inHouse, (c) => c.person.neighborhood ?? 'Sin barrio cargado')
            .map(([neighborhood, list]) => ({
              neighborhood,
              pairs: stockPairs(list),
              rows: list.map(row),
            }))
            .sort((a, b) => b.pairs - a.pairs),
          atOptician: atOptician.map(row),
        };
      }

      if (route === '/reportes/por-persona') {
        if (!nominal) {
          throw new DemoError(
            'Este reporte muestra personas identificadas. Tu rol ve los totales en el resumen',
            403,
          );
        }
        const q = params.get('q') ?? '';
        const d = digits(q);
        const text = accents(q);
        return state.people
          .filter(
            (p) =>
              (d.length >= 3 && p.dni.includes(d)) ||
              accents(`${p.lastName} ${p.firstName}`).includes(text),
          )
          .slice(0, 10)
          .map((p) => {
            const mine = all
              .filter((c) => c.person.dni === p.dni)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return {
              id: p.id,
              name: `${p.lastName}, ${p.firstName}`,
              dni: p.dni,
              neighborhood: p.neighborhood,
              phone: p.phone,
              identityVerified: p.identityVerified,
              deliveredPairs: sumPairs(mine.filter((c) => CLOSED.includes(c.stage))),
              openPairs: sumPairs(mine.filter((c) => !CLOSED.includes(c.stage))),
              cases: mine.map((c) => ({
                caseId: c.id,
                code: c.code,
                stage: c.stage,
                hold: c.hold,
                channel: c.channel,
                pairs: c.pairs,
                reason: c.reason,
                createdAt: c.createdAt,
                overdue: c.overdue,
                optician: c.optician?.name ?? null,
                delivery: c.delivery,
              })),
            };
          });
      }
    }

    return null;
  }

  (globalThis as { __ecolentesDemo?: Handler }).__ecolentesDemo = handler;
}

export { DemoError };
export type { DemoState };
