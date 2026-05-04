import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { NodeType, type WorkflowDefinition } from '@tietide/shared';
import type { CreateWorkflowBody } from '@/api/workflows';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { Modal } from './Modal';

const newWorkflowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must be 1000 characters or less')
    .optional(),
});

type NewWorkflowFormValues = z.infer<typeof newWorkflowSchema>;

const buildStarterDefinition = (): WorkflowDefinition => ({
  nodes: [
    {
      id: 'trigger-1',
      type: NodeType.MANUAL_TRIGGER,
      name: 'Manual Trigger',
      position: { x: 0, y: 0 },
      config: {},
    },
  ],
  edges: [],
});

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 text-sm text-text-primary',
  'placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClasses = 'mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary';

export interface NewWorkflowModalProps {
  onClose: () => void;
  onCreate: (body: CreateWorkflowBody) => Promise<void> | void;
}

export function NewWorkflowModal({ onClose, onCreate }: NewWorkflowModalProps): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewWorkflowFormValues>({
    resolver: zodResolver(newWorkflowSchema),
    defaultValues: { name: '', description: '' },
  });

  const submit = handleSubmit(async (values) => {
    const body: CreateWorkflowBody = {
      name: values.name,
      definition: buildStarterDefinition(),
    };
    if (values.description && values.description.length > 0) {
      body.description = values.description;
    }
    try {
      await onCreate(body);
    } catch {
      // Parent toasts the error and decides whether to keep the modal open.
    }
  });

  return (
    <Modal titleId="new-workflow-title" ariaLabel="Create a new workflow" onClose={onClose}>
      <h2 id="new-workflow-title" className="mb-1 text-lg font-semibold text-text-primary">
        Create a new workflow
      </h2>
      <p className="mb-5 text-sm text-text-secondary">
        Give it a name — you can build the steps in the editor.
      </p>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="new-workflow-name" className={labelClasses}>
            Name
          </label>
          <input
            id="new-workflow-name"
            type="text"
            autoFocus
            className={inputClasses}
            aria-invalid={errors.name ? 'true' : 'false'}
            {...register('name')}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-error" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="new-workflow-description" className={labelClasses}>
            Description <span className="text-text-muted">(optional)</span>
          </label>
          <textarea
            id="new-workflow-description"
            rows={3}
            className={cn(inputClasses, 'resize-none')}
            aria-invalid={errors.description ? 'true' : 'false'}
            {...register('description')}
          />
          {errors.description && (
            <p className="mt-1 text-xs text-error" role="alert">
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition',
              'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {isSubmitting && <Spinner size="sm" label="Creating" />}
            <span>{isSubmitting ? 'Creating…' : 'Create'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
