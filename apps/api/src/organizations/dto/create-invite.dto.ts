import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { OrgRole } from '@tietide/shared';

// VIEWER..SUPERADMIN are all assignable via invite; the service further restricts
// what role the *caller* may grant (e.g. ADMIN cannot invite at SUPERADMIN).
const INVITABLE_ROLES: OrgRole[] = [
  OrgRole.SUPERADMIN,
  OrgRole.ADMIN,
  OrgRole.MEMBER,
  OrgRole.VIEWER,
];

export class CreateInviteDto {
  @ApiProperty({ example: 'teammate@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: INVITABLE_ROLES, example: OrgRole.MEMBER })
  @IsIn(INVITABLE_ROLES)
  role!: OrgRole;
}
