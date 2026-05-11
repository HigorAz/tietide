import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { OAuthModule } from './oauth/oauth.module';
import { ProviderHealthRegistry } from './health/provider-health.registry';
import { GoogleHealthChecker } from './health/checkers/google.checker';
import { MicrosoftHealthChecker } from './health/checkers/microsoft.checker';
import { SlackHealthChecker } from './health/checkers/slack.checker';
import { NotionHealthChecker } from './health/checkers/notion.checker';
import { OpenAIHealthChecker } from './health/checkers/openai.checker';
import { AnthropicHealthChecker } from './health/checkers/anthropic.checker';
import { TrelloHealthChecker } from './health/checkers/trello.checker';
import { AirtableHealthChecker } from './health/checkers/airtable.checker';
import { LinearHealthChecker } from './health/checkers/linear.checker';
import { GitHubHealthChecker } from './health/checkers/github.checker';
import { OllamaHealthChecker } from './health/checkers/ollama.checker';

@Module({
  imports: [forwardRef(() => OAuthModule)],
  controllers: [ConnectionsController],
  providers: [
    ConnectionsService,
    {
      provide: ProviderHealthRegistry,
      useFactory: (config: ConfigService) => {
        const registry = new ProviderHealthRegistry();
        registry.register(GoogleHealthChecker.fromConfig(config));
        registry.register(MicrosoftHealthChecker.fromConfig(config));
        registry.register(SlackHealthChecker.fromConfig(config));
        registry.register(NotionHealthChecker.fromConfig(config));
        registry.register(OpenAIHealthChecker.fromConfig(config));
        registry.register(AnthropicHealthChecker.fromConfig(config));
        registry.register(TrelloHealthChecker.fromConfig(config));
        registry.register(AirtableHealthChecker.fromConfig(config));
        registry.register(LinearHealthChecker.fromConfig(config));
        registry.register(GitHubHealthChecker.fromConfig(config));
        registry.register(OllamaHealthChecker.fromConfig());
        return registry;
      },
      inject: [ConfigService],
    },
  ],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
