import {
  createAdminEnvVar,
  deleteAdminEnvVar,
  listAdminEnvVars,
  updateAdminEnvVar,
} from '@/api/envVars';
import { EnvVarsManager } from '@/components/env-vars/EnvVarsManager';

export function AdminEnvVarsPage(): JSX.Element {
  return (
    <EnvVarsManager
      title="Global env vars (admin)"
      description="Available to every user's workflows. Per-user values override these on key collision."
      api={{
        list: listAdminEnvVars,
        create: createAdminEnvVar,
        update: updateAdminEnvVar,
        remove: deleteAdminEnvVar,
      }}
    />
  );
}

export default AdminEnvVarsPage;
