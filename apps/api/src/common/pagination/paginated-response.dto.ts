import { ApiProperty } from '@nestjs/swagger';
import type { Type } from '@nestjs/common';

/**
 * Factory producing a Swagger-documented paginated envelope DTO for a given item
 * type: `{ items: ItemDto[]; nextCursor: string | null }`. Each resource extends
 * the returned class so its list response is fully typed and documented without
 * repeating the envelope shape.
 */
export function PaginatedResponseDto<TItem>(
  ItemDto: Type<TItem>,
): Type<{ items: TItem[]; nextCursor: string | null }> {
  class PageDto {
    @ApiProperty({ type: [ItemDto] })
    items!: TItem[];

    @ApiProperty({
      type: String,
      nullable: true,
      description: 'Cursor to fetch the next page, or null when there are no more items.',
    })
    nextCursor!: string | null;
  }
  return PageDto;
}
