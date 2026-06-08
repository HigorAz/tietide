import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@tietide/shared';

/** An organization plus the calling user's role within it (org-switcher payload). */
export class OrganizationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acme Workspace' })
  name!: string;

  @ApiProperty({ example: 'acme-workspace-1a2b3c' })
  slug!: string;

  @ApiProperty({ enum: OrgRole, example: OrgRole.SUPERADMIN })
  role!: OrgRole;
}
