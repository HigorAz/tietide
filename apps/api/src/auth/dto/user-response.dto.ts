import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['USER', 'ADMIN'] })
  role!: string;

  @ApiProperty({ description: 'Whether the email address has been verified' })
  emailVerified!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
