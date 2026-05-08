import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Acting user id (admin or self)' })
  userId!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Acting user email' })
  userEmail!: string | null;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  resource!: string;

  @ApiPropertyOptional({ nullable: true })
  resourceId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  metadata!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  items!: AuditLogResponseDto[];

  @ApiPropertyOptional({ nullable: true, description: 'Cursor for next page' })
  nextCursor!: string | null;
}

export class AuditLogFilterUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class AuditLogFiltersResponseDto {
  @ApiProperty({ type: [AuditLogFilterUserDto] })
  users!: AuditLogFilterUserDto[];

  @ApiProperty({ type: [String] })
  actions!: string[];

  @ApiProperty({ type: [String] })
  resources!: string[];
}
