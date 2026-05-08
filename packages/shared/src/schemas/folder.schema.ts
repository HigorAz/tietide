import { z } from 'zod';

export const FOLDER_NAME_MAX_LENGTH = 120;

export const folderNameSchema = z
  .string()
  .min(1)
  .max(FOLDER_NAME_MAX_LENGTH)
  .regex(/^[^\x00-\x1f\x7f/\\]+$/, 'Folder name contains invalid characters');

export const createFolderSchema = z.object({
  name: folderNameSchema,
  parentFolderId: z.string().uuid().nullable().optional(),
});

export const updateFolderSchema = z
  .object({
    name: folderNameSchema.optional(),
    parentFolderId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (val) => val.name !== undefined || val.parentFolderId !== undefined,
    'Provide at least one of: name, parentFolderId',
  );

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
