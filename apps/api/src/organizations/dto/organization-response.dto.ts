import { ApiProperty } from '@nestjs/swagger';

export class OrganizationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acme Workspace' })
  name!: string;

  @ApiProperty({ example: 'acme-workspace-1a2b3c' })
  slug!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
