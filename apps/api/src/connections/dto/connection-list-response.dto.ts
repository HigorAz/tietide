import { PaginatedResponseDto } from '../../common/pagination/paginated-response.dto';
import { ConnectionResponseDto } from './connection-response.dto';

export class PaginatedConnectionsDto extends PaginatedResponseDto(ConnectionResponseDto) {}
