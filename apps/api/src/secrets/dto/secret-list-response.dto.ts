import { PaginatedResponseDto } from '../../common/pagination/paginated-response.dto';
import { SecretResponseDto } from './secret-response.dto';

export class PaginatedSecretsDto extends PaginatedResponseDto(SecretResponseDto) {}
