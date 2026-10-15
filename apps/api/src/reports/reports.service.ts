import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditAction, CaseStage, Prisma } from '@prisma/client';
import {
  buildEvolution,
  evolutionSince,
  isOverdue,
  seesIdentityInReports,
  suppressSmallCell,
} from '@ecolentes/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeDni } from '../common/dni';
import { searchText } from '../common/search-text';
import type { AuthenticatedUser } from '../common/current-user';
import type { DeliveriesDto, EvolutionDto, PersonReportDto, SummaryDto } from './dto';

/** Etapas en las que el expediente ya terminó su recorrido. */
const CLOSED_STAGES: CaseStage[] = [CaseStage.DELIVERED, CaseStage.CLOSED];
/** Pares que ya están en el municipio y todavía no se entregaron. */
const IN_HOUSE_STAGES: CaseStage[] = [CaseStage.RECEIVED, CaseStage.READY_FOR_PICKUP];
/** Mientras el expediente está en manos de la óptica. */
const AT_OPTICIAN_STAGES: CaseStage[] = [
  CaseStage.OPTICIAN_QUOTE,
  CaseStage.APPROVAL,
  CaseStage.PRODUCTION,
];

type Counted = { total: number; pairs: number; overdue: number };

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Los números del mes. No devuelve ningún nombre: son totales, y es el único
   * reporte que puede salir del sistema hacia el equipo del municipio.
   */
  async summary(params: SummaryDto, viewer: AuthenticatedUser) {
    const shareable = params.shareable === 'true';
    const data = await this.summaryData(shareable);

    await this.audit.record({
      action: AuditAction.VIEW,
      entity: 'Report',
      entityId: shareable ? 'resumen-compartible' : 'resumen',
      userId: viewer.id,
      username: viewer.username,
    });

    return data;
  }

  /**
   * El cálculo del resumen, sin registrar nada. Lo usan la pantalla de
   * indicadores y la API del municipio, que auditan cada una a su manera.
   */
  async summaryData(shareable: boolean) {
    const cases = await this.prisma.case.findMany({
      select: {
        stage: true,
        stageSince: true,
        channel: true,
        pairs: true,
        hold: true,
        opticianId: true,
        optician: { select: { name: true } },
        person: { select: { dni: true, neighborhood: true, identityVerified: true } },
      },
    });

    const open = cases.filter((c) => !CLOSED_STAGES.includes(c.stage));
    const delivered = cases.filter((c) => CLOSED_STAGES.includes(c.stage));
    const late = open.filter((c) => isOverdue(c.stage, c.stageSince));

    const byStage = Object.values(CaseStage).map((stage) => {
      const list = cases.filter((c) => c.stage === stage);
      return {
        stage,
        total: list.length,
        pairs: sumPairs(list),
        overdue: list.filter((c) => isOverdue(c.stage, c.stageSince)).length,
      };
    });

    const byChannel = groupBy(cases, (c) => c.channel).map(([channel, list]) => ({
      channel,
      ...count(list),
    }));

    const byNeighborhood = groupBy(cases, (c) => c.person.neighborhood ?? 'Sin barrio cargado')
      .map(([neighborhood, list]) => {
        const openHere = list.filter((c) => !CLOSED_STAGES.includes(c.stage));
        const raw = {
          open: openHere.length,
          delivered: list.filter((c) => CLOSED_STAGES.includes(c.stage)).length,
          overdue: openHere.filter((c) => isOverdue(c.stage, c.stageSince)).length,
        };
        return {
          neighborhood,
          // Afuera, un 1 o un 2 en un barrio chico señala a una persona.
          open: shareable ? suppressSmallCell(raw.open) : raw.open,
          delivered: shareable ? suppressSmallCell(raw.delivered) : raw.delivered,
          overdue: shareable ? suppressSmallCell(raw.overdue) : raw.overdue,
        };
      })
      .sort((a, b) => a.neighborhood.localeCompare(b.neighborhood, 'es'));

    // Demoras por óptica: sólo mientras el expediente está en sus manos.
    const atOptician = cases.filter((c) => AT_OPTICIAN_STAGES.includes(c.stage));
    const byOptician = groupBy(atOptician, (c) => c.optician?.name ?? 'Sin óptica asignada').map(
      ([optician, list]) => ({ optician, ...count(list) }),
    );

    return {
      shareable,
      kpis: {
        requests: cases.length,
        people: new Set(cases.map((c) => c.person.dni)).size,
        pairs: sumPairs(cases),
        deliveredCases: delivered.length,
        deliveredPairs: sumPairs(delivered),
        // Aprobadas pero todavía no entregadas: no cuentan como entrega.
        approvedNotDelivered: cases.filter((c) =>
          [CaseStage.PRODUCTION, ...IN_HOUSE_STAGES].includes(c.stage),
        ).length,
        open: open.length,
        overdue: late.length,
        onHold: open.filter((c) => c.hold !== null).length,
        unverifiedIdentity: cases.filter((c) => !c.person.identityVerified).length,
      },
      byStage,
      byChannel,
      byNeighborhood,
      byOptician,
    };
  }

  /**
   * El padrón de entregas: el respaldo de "cuántos anteojos se entregaron".
   * Cada fila tiene detrás un expediente y quién firmó la recepción.
   */
  async deliveries(params: DeliveriesDto, viewer: AuthenticatedUser) {
    const nominal = seesIdentityInReports(viewer.role);
    const where: Prisma.DeliveryWhereInput = {};
    if (params.from || params.to) {
      where.deliveredAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const deliveries = await this.prisma.delivery.findMany({
      where,
      orderBy: { deliveredAt: 'desc' },
      take: params.take ?? 200,
      include: {
        handedBy: { select: { fullName: true } },
        case: {
          select: {
            id: true,
            code: true,
            pairs: true,
            channel: true,
            person: {
              select: {
                firstName: true,
                lastName: true,
                dni: true,
                neighborhood: true,
                identityVerified: true,
              },
            },
          },
        },
      },
    });

    await this.audit.record({
      action: AuditAction.VIEW,
      entity: 'Report',
      entityId: 'padron-de-entregas',
      userId: viewer.id,
      username: viewer.username,
      changes: { filas: deliveries.length, conIdentidad: nominal },
    });

    return {
      nominal,
      totals: {
        deliveries: deliveries.length,
        pairs: deliveries.reduce((acc, d) => acc + d.case.pairs, 0),
        byRepresentative: deliveries.filter((d) => d.isRepresentative).length,
        unverifiedIdentity: deliveries.filter((d) => !d.case.person.identityVerified).length,
      },
      rows: deliveries.map((d) => ({
        caseId: d.case.id,
        code: d.case.code,
        deliveredAt: d.deliveredAt,
        pairs: d.case.pairs,
        channel: d.case.channel,
        neighborhood: d.case.person.neighborhood,
        identityVerified: d.case.person.identityVerified,
        isRepresentative: d.isRepresentative,
        handedBy: d.handedBy?.fullName ?? null,
        note: d.note,
        // A Dirección le alcanza con saber si lo recibió el titular o un
        // representante; el nombre no le hace falta para medir.
        person: nominal
          ? {
              name: `${d.case.person.lastName}, ${d.case.person.firstName}`,
              dni: d.case.person.dni,
            }
          : null,
        receivedBy: nominal ? d.receivedBy : d.isRepresentative ? 'Representante' : 'Titular',
      })),
    };
  }

  /**
   * El stock por entregar: qué anteojos hay, cuáles están listos y a quién le
   * corresponde cada uno. Se lista por el código del anteojo y no por el
   * expediente, porque es lo que se puede ir tachando contra la caja.
   */
  async pending(viewer: AuthenticatedUser) {
    const nominal = seesIdentityInReports(viewer.role);

    const cases = await this.prisma.case.findMany({
      where: { stage: { in: [...IN_HOUSE_STAGES, CaseStage.PRODUCTION] } },
      orderBy: { stageSince: 'asc' },
      include: {
        person: { select: { firstName: true, lastName: true, dni: true, neighborhood: true } },
        optician: { select: { name: true } },
        glasses: {
          where: { deliveredAt: null },
          select: { code: true, kind: true },
          orderBy: { code: 'asc' },
        },
      },
    });

    const row = (c: (typeof cases)[number]) => ({
      caseId: c.id,
      code: c.code,
      stage: c.stage,
      hold: c.hold,
      pairs: pairsOf(c),
      glasses: c.glasses,
      neighborhood: c.person.neighborhood,
      stageSince: c.stageSince,
      overdue: isOverdue(c.stage, c.stageSince),
      optician: c.optician?.name ?? null,
      person: nominal
        ? { name: `${c.person.lastName}, ${c.person.firstName}`, dni: c.person.dni }
        : null,
    });

    const inHouse = cases.filter((c) => IN_HOUSE_STAGES.includes(c.stage));
    const atOptician = cases.filter((c) => c.stage === CaseStage.PRODUCTION);
    // Los que ya se controlaron y se pueden entregar hoy, aparte de los que
    // acaban de llegar: en la caja están juntos, pero no se entregan igual.
    const ready = inHouse.filter((c) => c.stage === CaseStage.READY_FOR_PICKUP);
    const toCheck = inHouse.filter((c) => c.stage === CaseStage.RECEIVED);

    await this.audit.record({
      action: AuditAction.VIEW,
      entity: 'Report',
      entityId: 'pendientes-de-entrega',
      userId: viewer.id,
      username: viewer.username,
    });

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
        overdue: cases.filter((c) => isOverdue(c.stage, c.stageSince)).length,
      },
      // Agrupado por barrio, que es como se organiza la entrega en territorio.
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

  /**
   * Cuántos pares se entregaron, cuántos llegaron y cuántos quedaban en el
   * municipio, semana a semana o mes a mes. Son totales sin nombres, así que
   * lo ven todos los roles que entran a los reportes.
   */
  async evolution(params: EvolutionDto, viewer: AuthenticatedUser) {
    const period = params.periodo ?? 'semana';
    const since = evolutionSince(period);

    // Interesan los que se entregaron en la ventana y los que pasaron alguna
    // vez por el municipio: con eso alcanza para reconstruir la caja.
    const cases = await this.prisma.case.findMany({
      where: {
        OR: [
          { delivery: { is: { deliveredAt: { gte: since } } } },
          { events: { some: { toStage: { in: IN_HOUSE_STAGES } } } },
        ],
      },
      select: {
        pairs: true,
        delivery: { select: { deliveredAt: true } },
        _count: { select: { glasses: true } },
        events: {
          where: { toStage: { not: null } },
          select: { toStage: true, occurredAt: true },
        },
      },
    });

    await this.audit.record({
      action: AuditAction.VIEW,
      entity: 'Report',
      entityId: 'evolucion',
      userId: viewer.id,
      username: viewer.username,
      changes: { periodo: period },
    });

    return buildEvolution(
      period,
      cases.map((c) => ({
        pairs: c.pairs,
        stockPairs: c._count.glasses || c.pairs,
        deliveredAt: c.delivery?.deliveredAt ?? null,
        events: c.events,
      })),
    );
  }

  /**
   * Todo lo que pidió una persona, aunque haya entrado por canales distintos.
   * Responde "¿cuántos anteojos recibió?" sin revisar expediente por expediente.
   */
  async byPerson(params: PersonReportDto, viewer: AuthenticatedUser) {
    if (!seesIdentityInReports(viewer.role)) {
      throw new ForbiddenException(
        'Este reporte muestra personas identificadas. Tu rol ve los totales en el resumen',
      );
    }

    const q = params.q.trim();
    const digits = normalizeDni(q);
    const people = await this.prisma.person.findMany({
      where: {
        OR: [
          ...(digits.length >= 3 ? [{ dni: { contains: digits } }] : []),
          { searchName: { contains: searchText(q) } },
        ],
      },
      take: 10,
      include: {
        cases: {
          orderBy: { createdAt: 'asc' },
          include: {
            delivery: true,
            optician: { select: { name: true } },
          },
        },
      },
    });

    // Reporte con nombre y DNI: queda quién consultó, a quién y por qué.
    await this.audit.record({
      action: AuditAction.VIEW,
      entity: 'Report',
      entityId: 'por-persona',
      userId: viewer.id,
      username: viewer.username,
      changes: { busqueda: q, motivo: params.reason ?? null, encontradas: people.length },
    });

    return people.map((p) => {
      const deliveredCases = p.cases.filter((c) => CLOSED_STAGES.includes(c.stage));
      const openCases = p.cases.filter((c) => !CLOSED_STAGES.includes(c.stage));
      return {
        id: p.id,
        name: `${p.lastName}, ${p.firstName}`,
        dni: p.dni,
        neighborhood: p.neighborhood,
        phone: p.phone,
        identityVerified: p.identityVerified,
        deliveredPairs: sumPairs(deliveredCases),
        openPairs: sumPairs(openCases),
        cases: p.cases.map((c) => ({
          caseId: c.id,
          code: c.code,
          stage: c.stage,
          hold: c.hold,
          channel: c.channel,
          pairs: c.pairs,
          reason: c.reason,
          createdAt: c.createdAt,
          overdue: isOverdue(c.stage, c.stageSince),
          optician: c.optician?.name ?? null,
          delivery: c.delivery
            ? {
                deliveredAt: c.delivery.deliveredAt,
                receivedBy: c.delivery.receivedBy,
                isRepresentative: c.delivery.isRepresentative,
              }
            : null,
        })),
      };
    });
  }
}

function sumPairs(list: { pairs: number }[]): number {
  return list.reduce((acc, c) => acc + c.pairs, 0);
}

/**
 * Cuántos pares tiene el expediente sin entregar. Se cuentan los anteojos
 * numerados, que son los que están en la caja; la columna `pairs` queda como
 * respaldo para un expediente viejo al que nunca se le emitieron anteojos.
 */
function pairsOf(c: { glasses: unknown[]; pairs: number }): number {
  return c.glasses.length || c.pairs;
}

/** Los pares de un grupo de expedientes, contados por anteojo. */
function stockPairs(list: { glasses: unknown[]; pairs: number }[]): number {
  return list.reduce((acc, c) => acc + pairsOf(c), 0);
}

function count(list: { pairs: number; stage: CaseStage; stageSince: Date }[]): Counted {
  return {
    total: list.length,
    pairs: sumPairs(list),
    overdue: list.filter((c) => isOverdue(c.stage, c.stageSince)).length,
  };
}

/** Agrupa manteniendo el orden en que aparecieron las claves. */
function groupBy<T, K>(list: T[], key: (item: T) => K): [K, T[]][] {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()];
}
