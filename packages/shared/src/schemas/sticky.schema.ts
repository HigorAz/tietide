import { z } from 'zod';

export const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green'] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export const STICKY_DEFAULT_WIDTH = 220;
export const STICKY_DEFAULT_HEIGHT = 140;
export const STICKY_MIN_WIDTH = 120;
export const STICKY_MIN_HEIGHT = 80;
export const STICKY_MAX_WIDTH = 800;
export const STICKY_MAX_HEIGHT = 600;
export const STICKY_MAX_TEXT_LENGTH = 2000;

export const stickyConfigSchema = z.object({
  text: z.string().max(STICKY_MAX_TEXT_LENGTH).default(''),
  color: z.enum(STICKY_COLORS).default('yellow'),
  width: z.number().min(STICKY_MIN_WIDTH).max(STICKY_MAX_WIDTH).default(STICKY_DEFAULT_WIDTH),
  height: z.number().min(STICKY_MIN_HEIGHT).max(STICKY_MAX_HEIGHT).default(STICKY_DEFAULT_HEIGHT),
});

export type StickyConfig = z.infer<typeof stickyConfigSchema>;
