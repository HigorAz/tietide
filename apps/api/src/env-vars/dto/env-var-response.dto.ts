import { ApiProperty } from '@nestjs/swagger';

export class EnvVarResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'SLACK_WEBHOOK_URL' })
  key!: string;

  @ApiProperty({ enum: ['GLOBAL', 'USER'], example: 'USER' })
  scope!: 'GLOBAL' | 'USER';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
