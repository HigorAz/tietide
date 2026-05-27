import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackFindUserConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory, SlackHttpError } from './slack-client.factory';

export const SLACK_FIND_USER_TYPE = 'slack-find-user';

// users.list is paged; cap the number of pages so a name lookup in a huge
// workspace can't loop unboundedly (200 members/page × 25 = 5000 users).
const MAX_LIST_PAGES = 25;

interface SlackUser {
  id?: string;
  name?: string;
  real_name?: string;
  profile?: { email?: string; real_name?: string; display_name?: string };
}

interface SlackLookupByEmailResponse {
  ok?: boolean;
  user?: SlackUser;
}

interface SlackUsersListResponse {
  ok?: boolean;
  members?: SlackUser[];
  response_metadata?: { next_cursor?: string };
}

function mapUser(user: SlackUser | undefined): Record<string, unknown> | null {
  if (!user) return null;
  return {
    id: user.id ?? null,
    name: user.name ?? null,
    realName: user.real_name ?? user.profile?.real_name ?? null,
    email: user.profile?.email ?? null,
  };
}

function matchesName(user: SlackUser, needle: string): boolean {
  const candidates = [
    user.real_name,
    user.name,
    user.profile?.display_name,
    user.profile?.real_name,
  ];
  return candidates.some((c) => typeof c === 'string' && c.toLowerCase().includes(needle));
}

@Injectable()
export class SlackFindUserAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_FIND_USER_TYPE;
  readonly name = 'Slack: Find User';
  readonly description = 'Find a Slack user by email or by name';
  readonly requiredConnectionType = 'slack';

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackFindUserConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveLookedUp: { mode: params.mode, query: params.query } },
        metadata: { mocked: true },
      };
    }

    if (params.mode === 'email') {
      return this.findByEmail(connection, params.query);
    }
    return this.findByName(connection, params.query);
  }

  private async findByEmail(
    connection: DecryptedConnection<SlackOAuth2Config>,
    email: string,
  ): Promise<NodeOutput> {
    const search = new URLSearchParams({ email });
    try {
      const response = await this.client.call<SlackLookupByEmailResponse>(
        connection,
        `/users.lookupByEmail?${search.toString()}`,
        { method: 'GET' },
      );
      return {
        data: { found: response.data.user != null, user: mapUser(response.data.user) },
        metadata: { statusCode: response.status },
      };
    } catch (error) {
      // "Not found" is a valid outcome for a lookup node, not a failure.
      if (error instanceof SlackHttpError && this.isUsersNotFound(error)) {
        return { data: { found: false, user: null }, metadata: { statusCode: 200 } };
      }
      throw error;
    }
  }

  private async findByName(
    connection: DecryptedConnection<SlackOAuth2Config>,
    query: string,
  ): Promise<NodeOutput> {
    const needle = query.trim().toLowerCase();
    let cursor: string | undefined;
    let match: SlackUser | undefined;
    let pages = 0;
    do {
      const search = new URLSearchParams({ limit: '200' });
      if (cursor) search.set('cursor', cursor);
      const response = await this.client.call<SlackUsersListResponse>(
        connection,
        `/users.list?${search.toString()}`,
        { method: 'GET' },
      );
      match = (response.data.members ?? []).find((m) => matchesName(m, needle));
      cursor = response.data.response_metadata?.next_cursor || undefined;
      pages += 1;
    } while (!match && cursor && pages < MAX_LIST_PAGES);

    return { data: { found: match != null, user: mapUser(match) }, metadata: {} };
  }

  private isUsersNotFound(error: SlackHttpError): boolean {
    const body = error.response.body as { error?: unknown } | null;
    return body?.error === 'users_not_found';
  }
}
