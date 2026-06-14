import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

// Resolve an Ollama server's models from either a saved connection (decrypt its baseUrl)
// or an ad-hoc baseUrl (the connection-create form, before a connection exists). At least
// one must be present; the service rejects when both are missing.
export class OllamaModelsRequestDto {
  @ApiPropertyOptional({ description: 'Existing Ollama connection id' })
  @IsOptional()
  @IsUUID('4')
  connectionId?: string;

  @ApiPropertyOptional({ description: 'Ollama base URL (when no connection exists yet)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  // require_tld:false so `http://localhost:11434` validates.
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  baseUrl?: string;
}
