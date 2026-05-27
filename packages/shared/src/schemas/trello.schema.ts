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

export const trelloAddCommentConfigSchema = z.object({
  connectionId,
  cardId: trelloId,
  text: z.string().min(1).max(16_384),
  mockOnDryRun,
});
export type TrelloAddCommentConfig = z.infer<typeof trelloAddCommentConfigSchema>;

export const trelloUpdateCardConfigSchema = z.object({
  connectionId,
  cardId: trelloId,
  // Common updatable fields. Keep the surface narrow rather than pass-through —
  // any future field can be added explicitly with its own validation.
  name: z.string().min(1).max(16_384).optional(),
  desc: z.string().max(16_384).optional(),
  due: z.string().datetime({ offset: true }).max(64).nullable().optional(),
  closed: z.boolean().optional(),
  idList: trelloId.optional(),
  mockOnDryRun,
});
export type TrelloUpdateCardConfig = z.infer<typeof trelloUpdateCardConfigSchema>;

export const TRELLO_CARD_EVENT_TYPES = [
  'createCard',
  'updateCard',
  'deleteCard',
  'commentCard',
  'addMemberToCard',
  'removeMemberFromCard',
  'addAttachmentToCard',
  'addLabelToCard',
] as const;
export type TrelloCardEventType = (typeof TRELLO_CARD_EVENT_TYPES)[number];

export const trelloCardChangedConfigSchema = z.object({
  connectionId,
  // The Trello model the webhook listens on (board id, list id, or card id).
  // For a board-changed trigger this is typically the board id.
  modelId: trelloId,
  eventType: z.enum(TRELLO_CARD_EVENT_TYPES).optional(),
});
export type TrelloCardChangedConfig = z.infer<typeof trelloCardChangedConfigSchema>;

export const trelloGetCardConfigSchema = z.object({
  connectionId,
  cardId: trelloId,
});
export type TrelloGetCardConfig = z.infer<typeof trelloGetCardConfigSchema>;

export const TRELLO_LIST_CARDS_SOURCES = ['board', 'list'] as const;
export type TrelloListCardsSource = (typeof TRELLO_LIST_CARDS_SOURCES)[number];

export const trelloListCardsConfigSchema = z.object({
  connectionId,
  // Whether containerId refers to a board or a list.
  source: z.enum(TRELLO_LIST_CARDS_SOURCES),
  containerId: trelloId,
});
export type TrelloListCardsConfig = z.infer<typeof trelloListCardsConfigSchema>;

export const trelloCreateListConfigSchema = z.object({
  connectionId,
  boardId: trelloId,
  name: z.string().min(1).max(16_384),
  pos: z.union([z.literal('top'), z.literal('bottom'), z.number()]).optional(),
  mockOnDryRun,
});
export type TrelloCreateListConfig = z.infer<typeof trelloCreateListConfigSchema>;
