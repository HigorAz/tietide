import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ description: 'Signed JWT access token' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;
}
