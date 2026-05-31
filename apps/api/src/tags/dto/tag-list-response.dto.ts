import { PaginatedResponseDto } from '../../common/pagination/paginated-response.dto';
import { TagResponseDto } from './tag-response.dto';

export class PaginatedTagsDto extends PaginatedResponseDto(TagResponseDto) {}
