import { Modal } from '@/components/dashboard/Modal';

export interface VersionDiffModalProps {
  workflowId: string;
  fromVersion: number;
  onClose: () => void;
}

// Full implementation lands in the next commit.
export function VersionDiffModal({ fromVersion, onClose }: VersionDiffModalProps): JSX.Element {
  return (
    <Modal onClose={onClose} ariaLabel={`Compare version ${fromVersion}`}>
      <div className="text-text-primary">Comparing v{fromVersion} — coming up next.</div>
    </Modal>
  );
}
