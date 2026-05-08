import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditLogService, type AuditLogFilters } from './audit-log.service';
import {
  AuditLogFiltersResponseDto,
  AuditLogListResponseDto,
  type AuditLogResponseDto,
} from './dto/audit-log-response.dto';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

const CSV_HEADER = 'id,createdAt,userId,userEmail,action,resource,resourceId,metadata';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(row: AuditLogResponseDto): string {
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  const metadata = row.metadata == null ? '' : JSON.stringify(row.metadata);
  return [
    row.id,
    createdAt,
    row.userId,
    row.userEmail ?? '',
    row.action,
    row.resource,
    row.resourceId ?? '',
    metadata,
  ]
    .map((v) => csvEscape(String(v)))
    .join(',');
}

function pickFilters(query: ListAuditLogQueryDto): AuditLogFilters {
  const filters: AuditLogFilters = {};
  if (query.userId) filters.userId = query.userId;
  if (query.action) filters.action = query.action;
  if (query.resource) filters.resource = query.resource;
  if (query.from) filters.from = query.from;
  if (query.to) filters.to = query.to;
  return filters;
}

@ApiTags('admin-audit')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not an ADMIN' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/audit')
export class AdminAuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log rows with filters and cursor pagination (admin only)' })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  async list(@Query() query: ListAuditLogQueryDto): Promise<AuditLogListResponseDto> {
    return this.audit.findMany({
      filters: pickFilters(query),
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get('filters')
  @ApiOperation({ summary: 'Distinct users / actions / resources for filter dropdowns' })
  @ApiOkResponse({ type: AuditLogFiltersResponseDto })
  async filters(): Promise<AuditLogFiltersResponseDto> {
    return this.audit.listFilterValues();
  }

  @Get('export')
  @ApiOperation({ summary: 'Download filtered audit log as CSV (admin only, hard-capped)' })
  async export(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: ListAuditLogQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const filters = pickFilters(query);
    const rows = await this.audit.findAllForExport({ filters });

    const filename = `audit-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const body = [CSV_HEADER, ...rows.map(rowToCsv)].join('\n');
    res.send(body);

    await this.audit.log({
      userId: admin.id,
      action: 'audit.export',
      resource: 'audit',
      metadata: { filters, rows: rows.length },
    });
  }
}
