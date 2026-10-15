export type Role =
  | 'OPERATOR'
  | 'OPHTHALMOLOGIST'
  | 'OPTICIAN'
  | 'DIRECTOR'
  | 'SOCIAL_DESK'
  | 'ADMIN';

export type SessionUser = { id: string; username: string; fullName: string; role: Role };

export type Person = {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  ageAtIntake: number | null;
  /** Cuándo se tomó esa edad: sin eso, la edad cargada envejece sin que se note. */
  ageTakenAt: string | null;
  sex: 'FEMENINO' | 'MASCULINO' | 'OTRO' | null;
  phone: string | null;
  address: string | null;
  neighborhood: string | null;
  representativeName: string | null;
  representativePhone: string | null;
  representativeBond: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Foto del frente del DNI, si este rol puede verla y hay una cargada. */
  dniFrontId?: string | null;
};

/** Un par de anteojos. El código es lo que la persona tiene en la mano. */
export type Glasses = {
  code: string;
  kind: 'LEJOS' | 'CERCA';
  deliveredAt: string | null;
};

/** El estado de la persona en una línea, para la tabla de Personas. */
export type PersonSummary = {
  age: number | null;
  isMinor: boolean | null;
  cases: number;
  pairsRequested: number;
  pairsDelivered: number;
  lastDeliveryAt: string | null;
  openCase: {
    id: string;
    code: string;
    stage: CaseStage;
    hold: CaseHold | null;
    stageSince: string;
    overdue: boolean;
    glasses: Glasses[];
  } | null;
};

export type PersonWithSummary = Person & { summary: PersonSummary };

export type AuditEntry = {
  id: string;
  action: 'VIEW' | 'CREATE' | 'UPDATE' | 'LOGIN' | 'LOGIN_FAILED';
  username: string | null;
  changes: Record<string, { de: unknown; a: unknown }> | null;
  occurredAt: string;
};

export type CaseStage =
  | 'REQUEST'
  | 'ASSESSMENT'
  | 'OPTICIAN_QUOTE'
  | 'APPROVAL'
  | 'PRODUCTION'
  | 'RECEIVED'
  | 'READY_FOR_PICKUP'
  | 'DELIVERED'
  | 'CLOSED';

export type CaseHold =
  | 'MISSING_DOCUMENTS'
  | 'QUOTE_OBSERVED'
  | 'REJECTED'
  | 'DELAYED'
  | 'NOT_LOCATED'
  | 'WITHDRAWN'
  | 'COMPLAINT';

export type IntakeChannel =
  | 'NEIGHBORHOOD_SURVEY'
  | 'COUNCIL_REQUEST'
  | 'INDIVIDUAL_REQUEST'
  | 'TRAILER'
  | 'CAC'
  | 'SCHOOL'
  | 'SOCIAL_MEDIA'
  | 'PUBLIC_FORM';

export type Quote = {
  id: string;
  version: number;
  lenses: string;
  frame: string;
  leadDays: number | null;
  amount: string | null;
  notes: string | null;
  status: 'SUBMITTED' | 'APPROVED' | 'OBSERVED';
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type Prescription = {
  rawText: string;
  farRightSphere: string | null;
  farRightCylinder: string | null;
  farRightAxis: number | null;
  farLeftSphere: string | null;
  farLeftCylinder: string | null;
  farLeftAxis: number | null;
  nearAddition: string | null;
  validatedAt: string | null;
};

export type CaseEvent = {
  id: string;
  fromStage: CaseStage | null;
  toStage: CaseStage | null;
  hold: CaseHold | null;
  note: string | null;
  username: string | null;
  occurredAt: string;
};

export type CaseSummary = {
  id: string;
  code: string;
  stage: CaseStage;
  hold: CaseHold | null;
  holdNote: string | null;
  channel: IntakeChannel;
  pairs: number;
  stageSince: string;
  overdue: boolean;
  person: Person;
  optician: { id: string; name: string } | null;
  glasses: Glasses[];
  /** El último presupuesto de la óptica, si ya lo cargó. */
  quotes?: {
    version: number;
    lenses: string;
    frame: string;
    leadDays: number | null;
    amount: string | null;
    status: Quote['status'];
  }[];
};

export type AttachmentKind = 'DNI_FRONT' | 'DNI_BACK' | 'PRESCRIPTION';

export const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  DNI_FRONT: 'DNI, frente',
  DNI_BACK: 'DNI, dorso',
  PRESCRIPTION: 'Receta del oftalmólogo',
};

/** Una foto cargada, sin la foto: la imagen se pide aparte, de a una. */
export type Attachment = {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  bytes: number;
  createdAt: string;
  personId: string | null;
  caseId: string | null;
};

export type CaseDetail = CaseSummary & {
  reason: string | null;
  prescription: Prescription | null;
  quotes: Quote[];
  delivery: {
    deliveredAt: string;
    receivedBy: string;
    receivedByDni: string | null;
    isRepresentative: boolean;
    note: string | null;
  } | null;
  events: CaseEvent[];
  attachments: Attachment[];
};

export type Optician = { id: string; name: string };

export type SocialNetwork = 'WHATSAPP' | 'FACEBOOK' | 'INSTAGRAM';

/** Totales del resumen. Ninguno trae nombres: son números y nada más. */
export type Summary = {
  shareable: boolean;
  kpis: {
    requests: number;
    people: number;
    pairs: number;
    deliveredCases: number;
    deliveredPairs: number;
    approvedNotDelivered: number;
    open: number;
    overdue: number;
    onHold: number;
    unverifiedIdentity: number;
  };
  byStage: { stage: CaseStage; total: number; pairs: number; overdue: number }[];
  byChannel: { channel: IntakeChannel; total: number; pairs: number; overdue: number }[];
  /** En la vista para compartir, un número chico llega en null. */
  byNeighborhood: {
    neighborhood: string;
    open: number | null;
    delivered: number | null;
    overdue: number | null;
  }[];
  byOptician: { optician: string; total: number; pairs: number; overdue: number }[];
};

/** `person` llega en null cuando el rol no puede ver de quién se trata. */
export type DeliveryRow = {
  caseId: string;
  code: string;
  deliveredAt: string;
  pairs: number;
  channel: IntakeChannel;
  neighborhood: string | null;
  identityVerified: boolean;
  isRepresentative: boolean;
  handedBy: string | null;
  note: string | null;
  person: { name: string; dni: string } | null;
  receivedBy: string;
};

export type DeliveriesReport = {
  nominal: boolean;
  totals: {
    deliveries: number;
    pairs: number;
    byRepresentative: number;
    unverifiedIdentity: number;
  };
  rows: DeliveryRow[];
};

export type PendingRow = {
  caseId: string;
  code: string;
  stage: CaseStage;
  hold: CaseHold | null;
  pairs: number;
  /** Los anteojos de este expediente que todavía no se entregaron. */
  glasses: { code: string; kind: Glasses['kind'] }[];
  neighborhood: string | null;
  stageSince: string;
  overdue: boolean;
  optician: string | null;
  person: { name: string; dni: string } | null;
};

export type PendingReport = {
  nominal: boolean;
  totals: {
    inHousePairs: number;
    inHouseCases: number;
    /** Controlados y listos para entregar. */
    readyPairs: number;
    readyCases: number;
    /** Llegaron al municipio y falta controlarlos. */
    toCheckPairs: number;
    toCheckCases: number;
    atOpticianPairs: number;
    atOpticianCases: number;
    overdue: number;
  };
  byNeighborhood: { neighborhood: string; pairs: number; rows: PendingRow[] }[];
  atOptician: PendingRow[];
};

export type PersonReport = {
  id: string;
  name: string;
  dni: string;
  neighborhood: string | null;
  phone: string | null;
  identityVerified: boolean;
  deliveredPairs: number;
  openPairs: number;
  cases: {
    caseId: string;
    code: string;
    stage: CaseStage;
    hold: CaseHold | null;
    channel: IntakeChannel;
    pairs: number;
    reason: string | null;
    createdAt: string;
    overdue: boolean;
    optician: string | null;
    delivery: { deliveredAt: string; receivedBy: string; isRepresentative: boolean } | null;
  }[];
};

export type IntakeRow = {
  id: string;
  code: string;
  stage: CaseStage;
  hold: CaseHold | null;
  channel: IntakeChannel;
  socialNetwork: SocialNetwork | null;
  reason: string | null;
  createdAt: string;
  person: {
    id: string;
    firstName: string;
    lastName: string;
    dni: string;
    phone: string | null;
    neighborhood: string | null;
    identityVerified: boolean;
  };
};

export type SocialIntakeInput = {
  dni: string;
  firstName: string;
  lastName: string;
  socialNetwork: SocialNetwork;
  phone?: string;
  neighborhood?: string;
  reason?: string;
  notes?: string;
  force?: boolean;
};

export type SocialIntakeResult = {
  created: boolean;
  duplicate: { caseId: string; code: string; stage: CaseStage; createdAt: string } | null;
  case: { id: string; code: string } | null;
};

/**
 * La versión de demostración: todo corre en el navegador, con datos inventados
 * y sin servidor. Las pantallas son las mismas; lo único distinto es de dónde
 * salen los datos.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

const TOKEN_KEY = 'ecolentes.token';

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento la sesión dura lo que dure la pestaña.
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

/**
 * La versión de demostración instala acá un servidor de mentira que corre en el
 * navegador. En la aplicación de verdad esto no existe y todo sale por fetch.
 */
type DemoHandler = <T>(path: string, init: RequestInit) => Promise<T>;

/**
 * De dónde cuelga la API. Es una ruta del mismo origen, no una dirección
 * completa: así no hay que abrir CORS ni cargar un dominio en el build. Con la
 * aplicación montada adentro de otro sitio se le pone el prefijo, por ejemplo
 * `/ecolentes/api`, y el sitio de adelante reenvía eso a la API.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const demo = (globalThis as { __ecolentesDemo?: DemoHandler }).__ecolentesDemo;
  if (demo) return demo<T>(path, init);

  const token = readToken();
  const response = await fetch(`${API_BASE}/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (body as { message?: string | string[] } | null)?.message ?? 'No se pudo completar la acción';
    throw new ApiError(Array.isArray(message) ? message[0]! : message, response.status, body);
  }

  return body as T;
}

export const api = {
  login(username: string, password: string) {
    return request<{ accessToken: string; user: SessionUser; mustChangePassword: boolean }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
    );
  },
  listUsers() {
    return request<ManagedUser[]>('/usuarios');
  },
  listOpticians() {
    return request<OpticianOption[]>('/usuarios/opticas');
  },
  createUser(input: { username: string; fullName: string; role: Role; opticianId?: string }) {
    return request<{ user: ManagedUser; password: string }>('/usuarios', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateUser(
    id: string,
    input: { fullName?: string; role?: Role; opticianId?: string | null; active?: boolean },
  ) {
    return request<ManagedUser>(`/usuarios/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  resetUserPassword(id: string) {
    return request<{ password: string }>(`/usuarios/${id}/contrasena`, { method: 'POST' });
  },

  searchPeople(params: { q?: string; skip?: number; take?: number }, signal?: AbortSignal) {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.skip) search.set('skip', String(params.skip));
    if (params.take) search.set('take', String(params.take));
    return request<PersonWithSummary[]>(`/personas?${search.toString()}`, { signal });
  },
  personByDni(dni: string) {
    return request<Person>(`/personas/por-dni/${encodeURIComponent(dni)}`);
  },
  person(id: string) {
    return request<Person>(`/personas/${id}`);
  },
  personHistory(id: string) {
    return request<AuditEntry[]>(`/personas/${id}/historial`);
  },
  createPerson(input: Partial<Person> & { dni: string; firstName: string; lastName: string }) {
    return request<Person>('/personas', { method: 'POST', body: JSON.stringify(input) });
  },

  listCases(params: {
    stage?: CaseStage | '';
    q?: string;
    neighborhood?: string;
    overdue?: boolean;
    take?: number;
  }) {
    const search = new URLSearchParams();
    if (params.stage) search.set('stage', params.stage);
    if (params.q) search.set('q', params.q);
    if (params.neighborhood) search.set('neighborhood', params.neighborhood);
    if (params.overdue) search.set('overdue', 'true');
    if (params.take) search.set('take', String(params.take));
    return request<CaseSummary[]>(`/expedientes?${search.toString()}`);
  },
  case(id: string) {
    return request<CaseDetail>(`/expedientes/${id}`);
  },
  /** Guarda una foto. Reemplaza la anterior del mismo tipo, si había. */
  uploadAttachment(input: {
    kind: AttachmentKind;
    personId?: string;
    caseId?: string;
    dataUrl: string;
  }) {
    return request<Attachment>('/adjuntos', { method: 'POST', body: JSON.stringify(input) });
  },
  /** La imagen en sí. Cada vez que se pide queda registrado quién la miró. */
  attachment(id: string) {
    return request<Attachment & { dataUrl: string }>(`/adjuntos/${id}`);
  },

  createCase(input: { personId: string; channel: IntakeChannel; reason?: string }) {
    return request<CaseSummary>('/expedientes', { method: 'POST', body: JSON.stringify(input) });
  },
  assignOptician(id: string, opticianId: string) {
    return request<CaseSummary>(`/expedientes/${id}/optica`, {
      method: 'PATCH',
      body: JSON.stringify({ opticianId }),
    });
  },
  setPrescription(id: string, rawText: string) {
    return request<Prescription>(`/expedientes/${id}/receta`, {
      method: 'POST',
      body: JSON.stringify({ rawText }),
    });
  },
  submitQuote(
    id: string,
    input: { lenses: string; frame: string; leadDays?: number; amount?: number; notes?: string },
  ) {
    return request<Quote>(`/expedientes/${id}/propuesta`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  decideQuote(id: string, approve: boolean, note?: string) {
    return request<CaseSummary>(`/expedientes/${id}/aprobacion`, {
      method: 'POST',
      body: JSON.stringify({ approve, note }),
    });
  },
  moveStage(id: string, to: CaseStage, note?: string) {
    return request<CaseSummary>(`/expedientes/${id}/etapa`, {
      method: 'PATCH',
      body: JSON.stringify({ to, note }),
    });
  },
  registerDelivery(
    id: string,
    input: {
      deliveredAt: string;
      receivedBy: string;
      receivedByDni?: string;
      isRepresentative?: boolean;
      note?: string;
    },
  ) {
    return request<unknown>(`/expedientes/${id}/entrega`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  setHold(id: string, hold: CaseHold, note?: string) {
    return request<CaseSummary>(`/expedientes/${id}/freno`, {
      method: 'PATCH',
      body: JSON.stringify({ hold, note }),
    });
  },

  summary(shareable: boolean) {
    return request<Summary>(`/reportes/resumen${shareable ? '?shareable=true' : ''}`);
  },
  deliveriesReport() {
    return request<DeliveriesReport>('/reportes/entregas');
  },
  pendingReport() {
    return request<PendingReport>('/reportes/pendientes');
  },
  personReport(q: string, reason: string) {
    const search = new URLSearchParams({ q });
    if (reason) search.set('reason', reason);
    return request<PersonReport[]>(`/reportes/por-persona?${search.toString()}`);
  },

  recentIntake() {
    return request<IntakeRow[]>('/ingresos/redes');
  },
  intakeFromSocialMedia(input: SocialIntakeInput) {
    return request<SocialIntakeResult>('/ingresos/redes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  verifyIdentity(personId: string) {
    return request<Person>(`/ingresos/personas/${personId}/verificar-identidad`, {
      method: 'POST',
    });
  },
  /** Lo manda el vecino desde el formulario público, sin estar logueado. */
  submitPublicForm(input: {
    dni: string;
    firstName: string;
    lastName: string;
    phone: string;
    neighborhood?: string;
    reason?: string;
  }) {
    return request<{ message: string }>('/ingresos/publico', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

export const STAGE_LABELS: Record<CaseStage, string> = {
  REQUEST: 'Solicitud',
  ASSESSMENT: 'Evaluación y receta',
  OPTICIAN_QUOTE: 'Pedido de compra',
  APPROVAL: 'Orden de compra',
  PRODUCTION: 'Producción',
  RECEIVED: 'Depósito',
  READY_FOR_PICKUP: 'Para entregar',
  DELIVERED: 'Entregado',
  CLOSED: 'Cerrado',
};

export const HOLD_LABELS: Record<CaseHold, string> = {
  MISSING_DOCUMENTS: 'Falta documentación',
  QUOTE_OBSERVED: 'Presupuesto observado',
  REJECTED: 'Rechazado',
  DELAYED: 'Demorado',
  NOT_LOCATED: 'No se pudo ubicar a la persona',
  WITHDRAWN: 'Desistió',
  COMPLAINT: 'Reclamo',
};

export const CHANNEL_LABELS: Record<IntakeChannel, string> = {
  NEIGHBORHOOD_SURVEY: 'Relevamiento en barrio',
  COUNCIL_REQUEST: 'Pedido de concejales o legisladores',
  INDIVIDUAL_REQUEST: 'Pedido individual del vecino',
  TRAILER: 'Tráiler',
  CAC: 'CAC',
  SCHOOL: 'Escuela',
  SOCIAL_MEDIA: 'Redes sociales',
  PUBLIC_FORM: 'Formulario público',
};

/** Días desde que el expediente entró en la etapa actual. */
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** 31620034 se muestra 31.620.034, como en la planilla. */
export function formatDni(dni: string): string {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export const SOCIAL_NETWORK_LABELS: Record<SocialNetwork, string> = {
  WHATSAPP: 'WhatsApp',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
};

/** Dirección y la óptica no ven nombres en los reportes. */
export function seesIdentityInReports(role: Role): boolean {
  return role === 'OPERATOR' || role === 'OPHTHALMOLOGIST' || role === 'SOCIAL_DESK' || role === 'ADMIN';
}

/** dd/mm/aaaa, que es como se escriben las fechas acá. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export type ManagedUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  opticianId: string | null;
  optician: { id: string; name: string } | null;
};

export type OpticianOption = { id: string; name: string };

export const ROLE_LABELS: Record<Role, string> = {
  OPERATOR: 'Operador Ecolentes',
  OPHTHALMOLOGIST: 'Profesional oftalmólogo',
  OPTICIAN: 'Óptica',
  DIRECTOR: 'Dirección',
  SOCIAL_DESK: 'Atención de consultas y redes',
  ADMIN: 'Administrador',
};
