import {
  createUserEnvVar,
  deleteUserEnvVar,
  listUserEnvVars,
  updateUserEnvVar,
} from '@/api/envVars';
import { EnvVarsManager } from '@/components/env-vars/EnvVarsManager';

export function SettingsEnvVarsPage(): JSX.Element {
  return (
    <EnvVarsManager
      title="Your env vars"
      description="Personal env vars are available only in your workflows. They override globals on key collision."
      api={{
        list: listUserEnvVars,
        create: createUserEnvVar,
        update: updateUserEnvVar,
        remove: deleteUserEnvVar,
      }}
    />
  );
}

export default SettingsEnvVarsPage;
