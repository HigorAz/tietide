import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { discordAddRoleConfigSchema, type DiscordBotConfig } from '@tietide/shared';
import { DiscordBotClientFactory } from './discord-bot-client.factory';

export const DISCORD_ADD_ROLE_TYPE = 'discord-add-role';

@Injectable()
export class DiscordAddRoleAction extends BaseConnectorAction<DiscordBotConfig> {
  readonly type = DISCORD_ADD_ROLE_TYPE;
  readonly name = 'Discord: Add Role';
  readonly description = 'Assign a role to a guild member using a bot token';
  readonly requiredConnectionType = 'discord-bot';

  constructor(private readonly client: DiscordBotClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<DiscordBotConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = discordAddRoleConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveAdded: { guildId: params.guildId, userId: params.userId, roleId: params.roleId },
        },
        metadata: { mocked: true },
      };
    }

    // PUT returns 204 No Content on success (no body).
    const response = await this.client.call(
      connection.config.botToken,
      'PUT',
      `/guilds/${params.guildId}/members/${params.userId}/roles/${params.roleId}`,
    );

    return {
      data: { ok: true, userId: params.userId, roleId: params.roleId },
      metadata: { statusCode: response.status },
    };
  }
}
