import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TestConnectionResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiPropertyOptional({
    example: 'Invalid API key',
    description: 'Provider error message when ok=false',
  })
  message?: string;

  @ApiProperty({ example: 142 })
  latencyMs!: number;
}
