import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';

export class ConnectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Object.values(ConnectionType), example: ConnectionType.OAUTH2 })
  type!: ConnectionType;

  @ApiProperty({ example: 'slack' })
  provider!: string;

  @ApiProperty({ example: 'Acme workspace' })
  name!: string;

  @ApiProperty({ enum: Object.values(ConnectionStatus), example: ConnectionStatus.ACTIVE })
  status!: ConnectionStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    description:
      'Whether the requesting user may edit/delete this connection (its owner or a workspace SUPERADMIN).',
    example: true,
  })
  canEdit?: boolean;
}
