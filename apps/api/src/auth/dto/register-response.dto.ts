import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class RegisterResponseDto extends UserResponseDto {
  @ApiProperty({ description: 'Signed JWT access token — registration auto-logs the user in' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;
}
