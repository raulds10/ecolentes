import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentKind, AuditAction, CaseStage, Prisma, type Person } from '@prisma/client';
import { isMinor, isOverdue, ageOf, seesAttachment } from '@ecolentes/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeDni } from '../common/dni';
import { searchText } from '../common/search-text';
import type { AuthenticatedUser } from '../common/current-user';
import type { CreatePersonDto, SearchPersonDto, UpdatePersonDto } from './dto';

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Busca por DNI o por nombre, y con cada ficha devuelve lo que hay que saber
   * de la persona sin entrar a abrirla: si alguna vez pidió anteojos, cuántos
   * recibió, y si tiene un expediente en curso en qué etapa está. Es lo que se
   * contesta por teléfono, y antes había que abrir ficha por ficha para verlo.
   */
  async search(params: SearchPersonDto): Promise<PersonWithSummary[]> {
    const take = params.take ?? 20;
    const q = params.q?.trim();
    const where: Prisma.PersonWhereInput = {};

    if (q) {
      const digits = normalizeDni(q);
      where.OR = [
        ...(digits.length >= 3 ? [{ dni: { contains: digits } }] : []),
        // Contra searchName, que no tiene acentos: "juarez" encuentra a Juárez.
        { searchName: { contains: searchText(q) } },
      ];
    }
    if (params.neighborhood) {
      where.neighborhood = { equals: params.neighborhood, mode: Prisma.QueryMode.insensitive };
    }

    const people = await this.prisma.person.findMany({
      where,
      // Por searchName, que es apellido y nombre sin acentos: ordenar por
      // lastName manda a Ávila después de Zárate, porque el acento ordena
      // detrás de todas las letras.
      orderBy: { searchName: 'asc' },
      skip: params.skip ?? 0,
      take,
    });
    if (people.length === 0) return [];

    // Los expedientes de todas las fichas encontradas en una sola consulta: una
    // por fila haría veinte consultas cada vez que alguien agrega un dígito.
    const cases = await this.prisma.case.findMany({
      where: { personId: { in: people.map((person) => person.id) } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        personId: true,
        stage: true,
        hold: true,
        pairs: true,
        stageSince: true,
        createdAt: true,
        glasses: { select: { code: true, kind: true, deliveredAt: true }, orderBy: { code: 'asc' } },
      },
    });

    const byPerson = new Map<string, typeof cases>();
    for (const found of cases) {
      const list = byPerson.get(found.personId);
      if (list) list.push(found);
      else byPerson.set(found.personId, [found]);
    }

    const now = new Date();
    return people.map((person) => ({
      ...person,
      summary: summarize(byPerson.get(person.id) ?? [], person, now),
    }));
  }

  /** La ficha exacta de un DNI, o null. La usa el formulario de carga. */
  async findByDni(dni: string): Promise<Person | null> {
    return this.prisma.person.findUnique({ where: { dni: normalizeDni(dni) } });
  }

  async findById(id: string, viewer: AuthenticatedUser): Promise<Person & { dniFrontId: string | null }> {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('No existe esa ficha');

    await this.audit.record({
      action: AuditAction.VIEW,
      entity: 'Person',
      entityId: person.id,
      userId: viewer.id,
      username: viewer.username,
    });

    // La foto del frente es de la ficha, no de un expediente. Quien no puede
    // verla no recibe ni el id: desde acá no hay forma de pedirla.
    const dniFront = seesAttachment(viewer.role, 'DNI_FRONT')
      ? await this.prisma.attachment.findFirst({
          where: { personId: person.id, kind: AttachmentKind.DNI_FRONT },
          select: { id: true },
        })
      : null;

    return { ...person, dniFrontId: dniFront?.id ?? null };
  }

  async create(dto: CreatePersonDto, author: AuthenticatedUser): Promise<Person> {
    const dni = normalizeDni(dto.dni);

    const existing = await this.prisma.person.findUnique({ where: { dni } });
    if (existing) {
      throw new ConflictException({
        message: 'Ya existe una ficha con ese DNI',
        personId: existing.id,
      });
    }

    const person = await this.prisma.person.create({
      data: {
        ...this.toData(dto),
        dni,
        createdById: author.id,
      },
    });

    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Person',
      entityId: person.id,
      userId: author.id,
      username: author.username,
    });

    return person;
  }

  async update(id: string, dto: UpdatePersonDto, author: AuthenticatedUser): Promise<Person> {
    const before = await this.prisma.person.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('No existe esa ficha');

    const person = await this.prisma.person.update({
      where: { id },
      data: this.toPatchData(dto, before),
    });

    const changes = diff(before, person);
    if (Object.keys(changes).length > 0) {
      await this.audit.record({
        action: AuditAction.UPDATE,
        entity: 'Person',
        entityId: person.id,
        userId: author.id,
        username: author.username,
        changes,
      });
    }

    return person;
  }

  history(personId: string) {
    return this.audit.historyFor('Person', personId);
  }

  /** Alta: lo que no vino queda vacío, porque la ficha no existía. */
  private toData(dto: CreatePersonDto) {
    return {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      searchName: searchText(dto.lastName, dto.firstName),
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      ageAtIntake: dto.ageAtIntake ?? null,
      // La edad sólo sirve si se sabe cuándo se tomó.
      ageTakenAt: dto.ageAtIntake != null ? new Date() : null,
      sex: dto.sex ?? null,
      phone: clean(dto.phone),
      address: clean(dto.address),
      neighborhood: clean(dto.neighborhood),
      representativeName: clean(dto.representativeName),
      representativePhone: clean(dto.representativePhone),
      representativeBond: clean(dto.representativeBond),
      notes: clean(dto.notes),
    };
  }

  /**
   * Edición: sólo toca los campos que vinieron. Si se armara el objeto
   * completo, una edición parcial borraría el teléfono o el barrio que
   * alguien cargó antes, sin que nadie se entere.
   */
  private toPatchData(dto: UpdatePersonDto, before: Person): Prisma.PersonUpdateInput {
    const data: Prisma.PersonUpdateInput = {};

    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      data.searchName = searchText(dto.lastName ?? before.lastName, dto.firstName ?? before.firstName);
    }
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.ageAtIntake !== undefined) {
      data.ageAtIntake = dto.ageAtIntake;
      data.ageTakenAt = dto.ageAtIntake != null ? new Date() : null;
    }
    if (dto.sex !== undefined) data.sex = dto.sex;
    if (dto.phone !== undefined) data.phone = clean(dto.phone);
    if (dto.address !== undefined) data.address = clean(dto.address);
    if (dto.neighborhood !== undefined) data.neighborhood = clean(dto.neighborhood);
    if (dto.representativeName !== undefined) {
      data.representativeName = clean(dto.representativeName);
    }
    if (dto.representativePhone !== undefined) {
      data.representativePhone = clean(dto.representativePhone);
    }
    if (dto.representativeBond !== undefined) {
      data.representativeBond = clean(dto.representativeBond);
    }
    if (dto.notes !== undefined) data.notes = clean(dto.notes);

    return data;
  }
}

/** Un anteojo visto desde la ficha de la persona: el código es lo que ella tiene. */
export type GlassesLine = { code: string; kind: 'LEJOS' | 'CERCA'; deliveredAt: Date | null };

/** El estado de la persona en una línea, para la tabla de Personas. */
export type PersonSummary = {
  age: number | null;
  /** null cuando la ficha no tiene ni fecha de nacimiento ni edad. */
  isMinor: boolean | null;
  /** Si alguna vez pidió anteojos. Cero expedientes es una ficha sin pedido. */
  cases: number;
  /** Pares pedidos y pares ya entregados, contando todos los expedientes. */
  pairsRequested: number;
  pairsDelivered: number;
  lastDeliveryAt: Date | null;
  /** El expediente en curso, si hay uno. Los cerrados no cuentan. */
  openCase: {
    id: string;
    code: string;
    stage: CaseStage;
    hold: string | null;
    stageSince: Date;
    overdue: boolean;
    glasses: GlassesLine[];
  } | null;
};

export type PersonWithSummary = Person & { summary: PersonSummary };

function summarize(
  cases: {
    id: string;
    code: string;
    stage: CaseStage;
    hold: string | null;
    pairs: number;
    stageSince: Date;
    glasses: GlassesLine[];
  }[],
  person: Person,
  now: Date,
): PersonSummary {
  const delivered = cases.flatMap((found) => found.glasses).filter((pair) => pair.deliveredAt);
  const fechas = delivered.map((pair) => pair.deliveredAt!.getTime());
  // El primero que no está cerrado: cases viene del más nuevo al más viejo.
  const open = cases.find((found) => found.stage !== CaseStage.CLOSED) ?? null;

  return {
    age: ageOf(person, now),
    isMinor: isMinor(person, now),
    cases: cases.length,
    pairsRequested: cases.reduce((total, found) => total + found.pairs, 0),
    pairsDelivered: delivered.length,
    lastDeliveryAt: fechas.length > 0 ? new Date(Math.max(...fechas)) : null,
    openCase: open && {
      id: open.id,
      code: open.code,
      stage: open.stage,
      hold: open.hold,
      stageSince: open.stageSince,
      overdue: isOverdue(open.stage, open.stageSince, now),
      glasses: open.glasses,
    },
  };
}

/** Qué cambió, para dejarlo en la auditoría sin guardar la ficha entera. */
function diff(before: Person, after: Person): Prisma.JsonObject {
  const changes: Prisma.JsonObject = {};
  // searchName se deriva del nombre: anotarlo sería repetir el mismo cambio.
  const skip = new Set(['updatedAt', 'createdAt', 'id', 'searchName']);

  for (const key of Object.keys(after) as (keyof Person)[]) {
    if (skip.has(key)) continue;
    const previous = before[key];
    const current = after[key];
    const same =
      previous instanceof Date && current instanceof Date
        ? previous.getTime() === current.getTime()
        : previous === current;
    if (!same) changes[key] = { de: serialize(previous), a: serialize(current) };
  }
  return changes;
}

function serialize(value: unknown): Prisma.JsonValue {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value as Prisma.JsonValue;
}

/** Texto vacío y texto en blanco se guardan como "sin dato". */
function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
