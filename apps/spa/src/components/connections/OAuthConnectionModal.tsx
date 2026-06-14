import { useMemo, useState } from 'react';
import type { ConnectionProvider as ConnectionProviderType } from '@tietide/shared';
import type { StartOAuthParams } from '@/api/connections';
import type { OAuthPopupOutcome } from '@/hooks/useOAuthPopup';
import { Modal } from '@/components/dashboard/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import { getProviderLabel, getProviderSetupGuidePath } from './providerCatalog';
import { buildSetupGuideUrl } from './setupGuideUrl';

export interface OAuthConnectionModalProps {
  provider: ConnectionProviderType;
  onClose: () => void;
  // MUST be invoked synchronously inside the Connect button click handler —
  // popup-blockers reject window.open if any await runs before it.
  onConnect: (params: StartOAuthParams) => Promise<OAuthPopupOutcome>;
}

interface ScopeGroup {
  id: string;
  label: string;
  description: string;
  scopes: readonly string[];
  defaultOn: boolean;
  locked?: boolean;
}

const SCOPE_GROUPS: Record<string, readonly ScopeGroup[]> = {
  google: [
    {
      id: 'profile',
      label: 'Profile',
      description: 'Sign in (name, email)',
      scopes: ['openid', 'email', 'profile'],
      defaultOn: true,
      locked: true,
    },
    {
      id: 'gmail',
      label: 'Gmail',
      description: 'Send, read, and organize email (labels, drafts, archive)',
      scopes: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      defaultOn: true,
    },
    {
      id: 'calendar',
      label: 'Calendar',
      description: 'Read and create events',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      defaultOn: true,
    },
    {
      id: 'drive',
      label: 'Drive',
      description: 'Access app files and read your Drive files',
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
      defaultOn: true,
    },
    {
      id: 'sheets',
      label: 'Sheets',
      description: 'Read and write spreadsheets',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      defaultOn: true,
    },
    {
      id: 'docs',
      label: 'Docs',
      description: 'Read and write documents',
      scopes: ['https://www.googleapis.com/auth/documents'],
      defaultOn: false,
    },
  ],
  microsoft: [
    {
      id: 'profile',
      label: 'Profile',
      description: 'Sign in (name, email)',
      // `offline_access` is required to get a refresh_token — without it the
      // worker can't perform the inline OAuth refresh-and-retry on a 401.
      scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
      defaultOn: true,
      locked: true,
    },
    {
      id: 'outlook',
      label: 'Outlook',
      description: 'Send, read, and update email (flag, categorize, drafts)',
      // Mail.ReadWrite backs outlook-update-message (flag/categorize/mark-read/move)
      // and outlook-create-draft; Mail.Read/Mail.Send cover get/search/send.
      scopes: ['Mail.Send', 'Mail.Read', 'Mail.ReadWrite'],
      defaultOn: true,
    },
    {
      id: 'calendar',
      label: 'Calendar',
      description: 'Read and create events',
      scopes: ['Calendars.ReadWrite'],
      defaultOn: true,
    },
    {
      id: 'onedrive',
      label: 'OneDrive',
      description: 'Read and write files',
      scopes: ['Files.ReadWrite'],
      defaultOn: true,
    },
  ],
  hubspot: [
    {
      id: 'account',
      label: 'Account',
      description: 'Identify the HubSpot account',
      // `oauth` is HubSpot's base scope — required for the token-introspection
      // call that resolves the hubId. Locked-on so it's always granted.
      scopes: ['oauth'],
      defaultOn: true,
      locked: true,
    },
    {
      id: 'contacts',
      label: 'Contacts',
      description: 'Read and create contacts',
      scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
      defaultOn: true,
    },
    {
      id: 'deals',
      label: 'Deals',
      description: 'Read and create deals',
      scopes: ['crm.objects.deals.read', 'crm.objects.deals.write'],
      defaultOn: true,
    },
    {
      id: 'companies',
      label: 'Companies',
      description: 'Read and write companies',
      scopes: ['crm.objects.companies.read', 'crm.objects.companies.write'],
      defaultOn: false,
    },
  ],
  slack: [
    {
      id: 'base',
      label: 'Base',
      // chat:write.public lets the bot post to a public channel it hasn't joined —
      // required for "Post to Channel by Name" to work without manually inviting
      // the bot first (otherwise chat.postMessage returns missing_scope).
      description:
        'Post messages (incl. channels the bot has not joined) and list channels (required)',
      scopes: ['chat:write', 'chat:write.public', 'channels:read'],
      defaultOn: true,
      locked: true,
    },
    {
      id: 'channels',
      label: 'Channels',
      description: 'Read history, create and manage channels',
      scopes: ['channels:history', 'channels:manage'],
      defaultOn: true,
    },
    {
      id: 'private-channels',
      label: 'Private channels',
      // groups:read is required to resolve a private channel by name in
      // conversations.list (the lookup "Post to Channel by Name" performs).
      description: 'Find private channels by name and read their history',
      scopes: ['groups:read', 'groups:history'],
      defaultOn: true,
    },
    {
      id: 'users',
      label: 'Users',
      description: 'Look up users by name or email',
      scopes: ['users:read', 'users:read.email'],
      defaultOn: true,
    },
    {
      id: 'reactions',
      label: 'Reactions',
      description: 'Add and read emoji reactions',
      scopes: ['reactions:read', 'reactions:write'],
      defaultOn: true,
    },
    {
      id: 'files',
      label: 'Files',
      description: 'Upload and read files',
      scopes: ['files:read', 'files:write'],
      defaultOn: false,
    },
    {
      id: 'mentions',
      label: 'Mentions',
      description: 'Receive @-mention events (for the app-mention trigger)',
      scopes: ['app_mentions:read'],
      defaultOn: false,
    },
    {
      id: 'search',
      label: 'Search (authorizes as you)',
      // search.messages needs a user token — selecting this requests a Slack
      // user_scope and grants an xoxp token tied to the installing user.
      description: 'Search messages — grants a user token tied to your account',
      scopes: ['search:read'],
      defaultOn: false,
    },
  ],
  github: [
    {
      id: 'account',
      label: 'Account',
      description: 'Identify the GitHub account',
      // `read:user` backs the connection health check (/user) and is always granted.
      scopes: ['read:user'],
      defaultOn: true,
      locked: true,
    },
    {
      id: 'repos',
      label: 'Repositories',
      description: 'Read/write issues, pull requests, and comments (incl. private repos)',
      scopes: ['repo'],
      defaultOn: true,
    },
    {
      id: 'public',
      label: 'Public repositories only',
      description: 'Limit access to public repositories',
      scopes: ['public_repo'],
      defaultOn: false,
    },
  ],
  instagram: [
    {
      id: 'publish',
      label: 'Publish content',
      description: 'Read the account and publish photo posts',
      scopes: [
        'instagram_basic',
        'instagram_content_publish',
        'pages_show_list',
        'business_management',
      ],
      defaultOn: true,
      locked: true,
    },
    {
      id: 'comments',
      label: 'Comments',
      description: 'Read comments (needed for the comment trigger)',
      scopes: ['instagram_manage_comments'],
      defaultOn: false,
    },
  ],
  whatsapp: [
    {
      id: 'messaging',
      label: 'Messaging',
      description: 'Send messages and templates, and manage the WhatsApp Business account',
      scopes: [
        'whatsapp_business_messaging',
        'whatsapp_business_management',
        'business_management',
      ],
      defaultOn: true,
      locked: true,
    },
  ],
};

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 text-sm text-text-primary',
  'placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClasses = 'mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary';

export function OAuthConnectionModal({
  provider,
  onClose,
  onConnect,
}: OAuthConnectionModalProps): JSX.Element {
  const providerLabel = getProviderLabel(provider);
  const groups = SCOPE_GROUPS[provider] ?? [];
  const [name, setName] = useState(`My ${providerLabel}`);
  const [nameTouched, setNameTouched] = useState(false);
  const [enabledGroups, setEnabledGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.defaultOn])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setupGuidePath = getProviderSetupGuidePath(provider);

  const trimmedName = name.trim();
  const nameError =
    trimmedName.length === 0
      ? 'Name is required'
      : trimmedName.length > 100
        ? '100 characters max'
        : null;

  const scopesParam = useMemo(() => {
    if (groups.length === 0) return undefined;
    const all = new Set<string>();
    for (const g of groups) {
      if (g.locked || enabledGroups[g.id]) {
        for (const s of g.scopes) all.add(s);
      }
    }
    return Array.from(all).join(',');
  }, [groups, enabledGroups]);

  const toggleGroup = (id: string, locked: boolean): void => {
    if (locked) return;
    setEnabledGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Synchronous click handler — must call onConnect without any awaits in
  // front so window.open inside useOAuthPopup runs inside the user gesture.
  const handleConnect = (): void => {
    setNameTouched(true);
    if (nameError) return;
    setSubmitting(true);
    setError(null);
    const params: StartOAuthParams = {
      provider,
      label: trimmedName,
      ...(scopesParam ? { scopes: scopesParam } : {}),
    };
    onConnect(params)
      .then((outcome) => {
        if (outcome.status === 'success') {
          onClose();
        } else if (outcome.status === 'error') {
          setError(outcome.message ?? 'OAuth failed');
        } else if (outcome.status === 'cancelled') {
          setError('Cancelled — popup closed before completing');
        } else {
          setError('Timed out — please try again');
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'OAuth failed');
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <Modal
      titleId="oauth-modal-title"
      ariaLabel={`Connect ${providerLabel}`}
      onClose={submitting ? () => undefined : onClose}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="oauth-modal-title" className="text-lg font-semibold text-text-primary">
          Connect {providerLabel}
        </h2>
        {setupGuidePath && (
          <a
            href={buildSetupGuideUrl(setupGuidePath)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'text-xs font-medium text-accent-teal transition',
              'hover:underline focus:outline-none focus:ring-1 focus:ring-accent-teal',
            )}
          >
            Setup guide ↗
          </a>
        )}
      </div>
      <p className="mb-5 text-sm text-text-secondary">
        You can create multiple {providerLabel} connections by giving each a unique name. Tokens are
        encrypted at rest with libsodium.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="oauth-modal-name" className={labelClasses}>
            Connection name
          </label>
          <input
            id="oauth-modal-name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            disabled={submitting}
            className={inputClasses}
            aria-invalid={nameTouched && nameError ? 'true' : 'false'}
          />
          {nameTouched && nameError && (
            <p className="mt-1 text-xs text-error" role="alert">
              {nameError}
            </p>
          )}
        </div>

        {groups.length > 0 && (
          <fieldset className="space-y-2">
            <legend className={labelClasses}>What this connection can access</legend>
            <div className="flex flex-col gap-2 rounded-md border border-white/5 bg-deep-blue/40 p-3">
              {groups.map((g) => {
                const id = `oauth-modal-scope-${g.id}`;
                const checked = g.locked || enabledGroups[g.id];
                return (
                  <label
                    key={g.id}
                    htmlFor={id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2',
                      g.locked && 'cursor-not-allowed opacity-80',
                    )}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      disabled={g.locked || submitting}
                      onChange={() => toggleGroup(g.id, !!g.locked)}
                      className="mt-0.5 h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
                    />
                    <span className="text-xs leading-snug">
                      <span className="font-medium text-text-primary">{g.label}</span>
                      {g.locked && <span className="ml-1 text-text-muted">(always)</span>}
                      <span className="block text-text-secondary">{g.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-text-muted">
              Google will show the consent screen — uncheck anything you don&apos;t want to grant.
            </p>
          </fieldset>
        )}

        {error && (
          <p className="text-xs text-error" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition',
              'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={submitting || (nameTouched && !!nameError)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {submitting && <Spinner size="sm" label="Connecting" />}
            <span>{submitting ? 'Waiting for consent…' : `Connect with ${providerLabel}`}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
