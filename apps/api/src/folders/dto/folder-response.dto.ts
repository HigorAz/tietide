import { ApiProperty } from '@nestjs/swagger';

export class FolderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Personal' })
  name!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  parentFolderId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class DeleteFolderResultDto {
  @ApiProperty({
    example: 3,
    description: 'Number of folders removed (the deleted folder + all descendants).',
  })
  deletedFolders!: number;

  @ApiProperty({
    example: 7,
    description: 'Number of workflows removed (cascaded from the deleted folders).',
  })
  deletedWorkflows!: number;
}
