import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@tietide/shared';

/** A pending invite as exposed to managers — never includes the token hash. */
export class OrgInviteResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'teammate@example.com' })
  email!: string;

  @ApiProperty({ enum: OrgRole, example: OrgRole.MEMBER })
  role!: OrgRole;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
