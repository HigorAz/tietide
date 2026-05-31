import { PaginatedResponseDto } from '../../common/pagination/paginated-response.dto';
import { EnvVarResponseDto } from './env-var-response.dto';

export class PaginatedEnvVarsDto extends PaginatedResponseDto(EnvVarResponseDto) {}
