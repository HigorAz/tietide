import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'client-a', minLength: 1, maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _\-]*$/, {
    message: 'Tag name must be alphanumeric with spaces, _ or -',
  })
  name!: string;

  @ApiPropertyOptional({ example: '#3366cc', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a 6-digit hex like #aabbcc' })
  color?: string | null;
}
