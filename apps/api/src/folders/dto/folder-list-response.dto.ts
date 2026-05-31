import { PaginatedResponseDto } from '../../common/pagination/paginated-response.dto';
import { FolderResponseDto } from './folder-response.dto';

export class PaginatedFoldersDto extends PaginatedResponseDto(FolderResponseDto) {}
