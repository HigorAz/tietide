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

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
