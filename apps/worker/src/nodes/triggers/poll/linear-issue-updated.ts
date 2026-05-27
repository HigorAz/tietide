import { Injectable } from '@nestjs/common';
import {
  BasePollTrigger,
  type DecryptedConnection,
  type PollContext,
  type PollResult,
} from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';
import { LinearClientFactory } from '../../connectors/linear/linear-client.factory';

export const LINEAR_ISSUE_UPDATED_TYPE = 'linear-issue-updated';

const ISSUES_UPDATED_QUERY = `
  query IssuesUpdated($filter: IssueFilter, $first: Int) {
    issues(filter: $filter, first: $first, orderBy: updatedAt) {
      nodes {
        id
        identifier
        title
        url
        updatedAt
      }
    }
  }
`;

interface IssuesUpdatedData {
  issues?: {
    nodes?: Array<{ id?: string; identifier?: string; updatedAt?: string }>;
  };
}

@Injectable()
export class LinearIssueUpdatedTrigger extends BasePollTrigger {
  readonly type = LINEAR_ISSUE_UPDATED_TYPE;
  readonly name = 'Linear: Issue Updated';
  readonly description = 'Fires when a Linear issue is created or updated (poll, updatedAt cursor)';
  readonly requiredConnectionType = 'linear';
  readonly defaultIntervalSeconds = 300;

  constructor(private readonly client: LinearClientFactory) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    // First tick: record "now" as the watermark and replay nothing.
    if (ctx.cursor === null) {
      return { items: [], newCursor: new Date().toISOString() };
    }

    const cfg = ctx.config as { teamId?: string };
    const connection = ctx.connection as DecryptedConnection<LinearApiKeyConfig>;

    const filter: Record<string, unknown> = { updatedAt: { gt: ctx.cursor } };
    if (cfg.teamId) filter.team = { id: { eq: cfg.teamId } };

    const response = await this.client.query<IssuesUpdatedData>(connection, ISSUES_UPDATED_QUERY, {
      filter,
      first: 50,
    });

    const nodes = response.data?.issues?.nodes ?? [];
    const newCursor = nodes.reduce(
      (max, n) => (typeof n.updatedAt === 'string' && n.updatedAt > max ? n.updatedAt : max),
      ctx.cursor,
    );

    const items = nodes.map((n) => ({
      id: n.id ?? null,
      identifier: n.identifier ?? null,
      updatedAt: n.updatedAt ?? null,
      issue: n,
    }));

    return { items, newCursor };
  }
}
