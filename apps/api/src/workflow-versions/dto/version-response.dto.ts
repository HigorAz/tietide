import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VersionAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}

export class WorkflowVersionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workflowId!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: Object })
  definition!: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true })
  message!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: VersionAuthorDto, nullable: true })
  createdBy!: VersionAuthorDto | null;
}

export class WorkflowVersionSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional({ nullable: true })
  message!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: VersionAuthorDto, nullable: true })
  createdBy!: VersionAuthorDto | null;
}

export class WorkflowVersionListResponseDto {
  @ApiProperty({ type: [WorkflowVersionSummaryDto] })
  items!: WorkflowVersionSummaryDto[];

  @ApiPropertyOptional({ nullable: true, description: 'Cursor for next page' })
  nextCursor!: string | null;
}

export class WorkflowVersionRestoreResponseDto {
  @ApiProperty()
  version!: number;

  @ApiProperty({ type: Object })
  definition!: Record<string, unknown>;
}
