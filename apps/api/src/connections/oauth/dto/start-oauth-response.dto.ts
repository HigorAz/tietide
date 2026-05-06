import { ApiProperty } from '@nestjs/swagger';

export class StartOAuthResponseDto {
  @ApiProperty({ description: 'Provider authorize URL the user should be redirected to' })
  redirectUrl!: string;

  @ApiProperty({ description: 'Signed state JWT (already embedded in redirectUrl)' })
  state!: string;
}
