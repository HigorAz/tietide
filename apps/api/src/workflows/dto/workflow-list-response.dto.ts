import { OmitType } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/pagination/paginated-response.dto';
import { WorkflowResponseDto } from './workflow-response.dto';

/**
 * List-view projection of a workflow: every field of {@link WorkflowResponseDto}
 * except the heavy `definition` JSONB, which list views never render (the editor
 * fetches it via `GET /v1/workflows/:id`). Dropping it keeps the list query and
 * payload light (W3.2).
 */
export class WorkflowListItemDto extends OmitType(WorkflowResponseDto, ['definition'] as const) {}

export class PaginatedWorkflowsDto extends PaginatedResponseDto(WorkflowListItemDto) {}
