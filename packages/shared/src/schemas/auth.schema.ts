import { z } from 'zod';

export const loginFormSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email').max(255),
  password: z.string().min(1, 'Password is required').max(128),
});

export const registerFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export const forgotPasswordFormSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email').max(255),
});

export const resetPasswordFormSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .refine(
      (pwd) => /^(?=.*[A-Za-z])(?=.*\d).+$/.test(pwd),
      'Password must contain at least one letter and one number',
    ),
});

export const updateProfileFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
});

export const changePasswordFormSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .refine(
      (pwd) => /^(?=.*[A-Za-z])(?=.*\d).+$/.test(pwd),
      'Password must contain at least one letter and one number',
    ),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;
export type UpdateProfileFormValues = z.infer<typeof updateProfileFormSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
