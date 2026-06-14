import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, IsUUID, MaxLength, MinLength } from 'class-validator';

// Pull a model onto an Ollama server (POST /api/pull). Resolves the server from a saved
// connection or an ad-hoc baseUrl (same as the models endpoint).
export class OllamaPullRequestDto {
  @ApiPropertyOptional({ description: 'Existing Ollama connection id' })
  @IsOptional()
  @IsUUID('4')
  connectionId?: string;

  @ApiPropertyOptional({ description: 'Ollama base URL (when no connection exists yet)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  baseUrl?: string;

  @ApiProperty({ description: 'Model tag to pull, e.g. qwen2.5:7b' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  model!: string;
}
