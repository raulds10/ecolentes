import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { DeliveriesDto, EvolutionDto, PersonReportDto, SummaryDto } from './dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthenticatedUser } from '../common/current-user';

/**
 * Los reportes son para adentro de Salud. La óptica no entra: ve sus propios
 * expedientes y nada más.
 */
@Controller('reportes')
@Roles(Role.OPERATOR, Role.OPHTHALMOLOGIST, Role.DIRECTOR, Role.SOCIAL_DESK, Role.ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('resumen')
  summary(@Query() query: SummaryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.summary(query, user);
  }

  @Get('entregas')
  deliveries(@Query() query: DeliveriesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.deliveries(query, user);
  }

  @Get('evolucion')
  evolution(@Query() query: EvolutionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.evolution(query, user);
  }

  @Get('pendientes')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.pending(user);
  }

  @Get('por-persona')
  byPerson(@Query() query: PersonReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.byPerson(query, user);
  }
}
