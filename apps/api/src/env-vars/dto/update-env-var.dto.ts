import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateEnvVarDto {
  @ApiPropertyOptional({
    example: 'SLACK_WEBHOOK_URL',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message:
      'key must start with an uppercase letter and contain only uppercase letters, digits, and underscores',
  })
  key?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 4096 })
  @ValidateIf((o: UpdateEnvVarDto) => o.key === undefined || o.value !== undefined)
  @IsString({ message: 'value must be a string; provide either key or value' })
  @MinLength(1)
  @MaxLength(4096)
  value?: string;
}
