import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  updateProfileFormSchema,
  type PublicUser,
  type UpdateProfileFormValues,
} from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { SettingsCard } from './SettingsCard';
import { sectionError } from './sectionError';

const formatMemberSince = (value: PublicUser['createdAt']): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary';
const readonlyValue = 'text-sm text-text-primary';

export function ProfileSection({ user }: { user: PublicUser }): JSX.Element {
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const toast = useToastStore((s) => s.show);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileFormSchema),
    values: { name: user.name },
  });

  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      await updateProfile(name.trim());
      reset({ name: name.trim() });
      toast({ tone: 'success', message: 'Profile updated.' });
    } catch (err) {
      toast({ tone: 'error', message: sectionError(err, 'Could not update your profile.') });
    }
  });

  return (
    <SettingsCard title="Profile" description="Your account details.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={fieldLabel}>Email</span>
          <p className={readonlyValue}>{user.email}</p>
        </div>
        <div>
          <span className={fieldLabel}>Role</span>
          <p className={readonlyValue}>{user.role}</p>
        </div>
        <div>
          <span className={fieldLabel}>Member since</span>
          <p className={readonlyValue}>{formatMemberSince(user.createdAt)}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-5 max-w-md">
        <label htmlFor="profile-name" className={fieldLabel}>
          Display name
        </label>
        <input
          id="profile-name"
          type="text"
          autoComplete="name"
          className="w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
          {...register('name')}
        />
        {errors.name?.message && (
          <p role="alert" className="mt-1 text-xs text-feedback-error">
            {errors.name.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className={cn(
            'mt-3 inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue',
            'transition-colors hover:bg-accent-teal-hover',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isSubmitting && <Spinner size="sm" label="Saving" />}
          <span>{isSubmitting ? 'Saving…' : 'Save changes'}</span>
        </button>
      </form>
    </SettingsCard>
  );
}
