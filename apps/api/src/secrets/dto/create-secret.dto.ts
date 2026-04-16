import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSecretDto {
  @ApiProperty({
    example: 'GITHUB_TOKEN',
    minLength: 1,
    maxLength: 100,
    description: 'Alphanumeric identifier (letters, digits, underscore, hyphen)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'name must contain only letters, digits, underscores, or hyphens',
  })
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 4096 })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  value!: string;
}
