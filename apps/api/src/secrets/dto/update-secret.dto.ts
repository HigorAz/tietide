import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateSecretDto {
  @ApiPropertyOptional({
    example: 'GITHUB_TOKEN',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'name must contain only letters, digits, underscores, or hyphens',
  })
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 4096 })
  @ValidateIf((o: UpdateSecretDto) => o.name === undefined || o.value !== undefined)
  @IsString({ message: 'value must be a string; provide either name or value' })
  @MinLength(1)
  @MaxLength(4096)
  value?: string;
}
