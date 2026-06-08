import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@tietide/shared';

export class OrgMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'teammate@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({ enum: OrgRole, example: OrgRole.MEMBER })
  role!: OrgRole;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
