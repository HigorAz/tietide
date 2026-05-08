import { ApiProperty } from '@nestjs/swagger';

export class TagResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'client-a' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: '#3366cc' })
  color!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
