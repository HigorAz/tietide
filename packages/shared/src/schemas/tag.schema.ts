import { z } from 'zod';

export const TAG_NAME_MAX_LENGTH = 60;

export const tagNameSchema = z
  .string()
  .min(1)
  .max(TAG_NAME_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _\-]*$/, 'Tag name must be alphanumeric with spaces, _ or -');

export const tagColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a 6-digit hex like #aabbcc');

export const createTagSchema = z.object({
  name: tagNameSchema,
  color: tagColorSchema.nullable().optional(),
});

export const updateTagSchema = z
  .object({
    name: tagNameSchema.optional(),
    color: tagColorSchema.nullable().optional(),
  })
  .refine(
    (val) => val.name !== undefined || val.color !== undefined,
    'Provide at least one of: name, color',
  );

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
