import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Trello IDs are 24-char hex MongoDB ObjectIds.
const trelloId = z
  .string()
  .length(24)
  .regex(/^[0-9a-fA-F]{24}$/, { message: 'must be a 24-char hex Trello ID' });

export const trelloCreateCardConfigSchema = z.object({
  connectionId,
  listId: trelloId,
  name: z.string().min(1).max(16_384),
  desc: z.string().max(16_384).optional(),
  pos: z.union([z.literal('top'), z.literal('bottom'), z.number()]).optional(),
  due: z.string().datetime({ offset: true }).max(64).optional(),
  idMembers: z.array(trelloId).max(100).optional(),
  idLabels: z.array(trelloId).max(100).optional(),
  mockOnDryRun,
});
export type TrelloCreateCardConfig = z.infer<typeof trelloCreateCardConfigSchema>;

export const trelloMoveCardConfigSchema = z.object({
  connectionId,
  cardId: trelloId,
  targetListId: trelloId,
  pos: z.union([z.literal('top'), z.literal('bottom'), z.number()]).optional(),
  mockOnDryRun,
});
export type TrelloMoveCardConfig = z.infer<typeof trelloMoveCardConfigSchema>;
