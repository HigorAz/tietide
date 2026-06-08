import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { OrgRole } from '@tietide/shared';

const ASSIGNABLE_ROLES: OrgRole[] = [
  OrgRole.SUPERADMIN,
  OrgRole.ADMIN,
  OrgRole.MEMBER,
  OrgRole.VIEWER,
];

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: OrgRole.ADMIN })
  @IsIn(ASSIGNABLE_ROLES)
  role!: OrgRole;
}
