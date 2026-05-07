import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateEnvVarDto {
  @ApiProperty({
    example: 'SLACK_WEBHOOK_URL',
    minLength: 1,
    maxLength: 100,
    description:
      'Environment variable identifier. Must match /^[A-Z][A-Z0-9_]*$/ (uppercase letter followed by uppercase letters, digits, or underscores).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message:
      'key must start with an uppercase letter and contain only uppercase letters, digits, and underscores',
  })
  key!: string;

  @ApiProperty({ minLength: 1, maxLength: 4096 })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  value!: string;
}
