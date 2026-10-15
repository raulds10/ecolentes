import { Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { EVOLUTION_PERIODS, type EvolutionPeriod } from '@ecolentes/shared';

export class SummaryDto {
  /**
   * Vista para compartir afuera: oculta los números de uno o dos casos, que en
   * un barrio chico alcanzan para saber de quién se habla.
   */
  @IsOptional()
  @IsBooleanString()
  shareable?: string;
}

export class DeliveriesDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  take?: number;
}

export class PersonReportDto {
  @IsString()
  @MinLength(3, { message: 'Escribí al menos 3 caracteres del DNI o del apellido' })
  q!: string;

  /**
   * Por qué se consulta. Queda en la auditoría: es un reporte con nombre y DNI,
   * y después hay que poder explicar quién lo miró y para qué.
   */
  @IsOptional()
  @IsString()
  reason?: string;
}

export class EvolutionDto {
  /** Cómo se corta la serie: por semana o por mes. */
  @IsOptional()
  @IsIn(EVOLUTION_PERIODS, { message: 'El período es "semana" o "mes"' })
  periodo?: EvolutionPeriod;
}
