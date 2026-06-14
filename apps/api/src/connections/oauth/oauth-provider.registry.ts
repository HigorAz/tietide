import { BadRequestException, Injectable } from '@nestjs/common';
import { GoogleOAuthProvider } from './providers/google.provider';
import { MicrosoftOAuthProvider } from './providers/microsoft.provider';
import { NotionOAuthProvider } from './providers/notion.provider';
import { SlackOAuthProvider } from './providers/slack.provider';
import { HubspotOAuthProvider } from './providers/hubspot.provider';
import { GithubOAuthProvider } from './providers/github.provider';
import { InstagramOAuthProvider } from './providers/instagram.provider';
import { WhatsappOAuthProvider } from './providers/whatsapp.provider';
import type { OAuthProvider } from './providers/oauth-provider.interface';

@Injectable()
export class OAuthProviderRegistry {
  private readonly providers: ReadonlyMap<string, OAuthProvider>;

  constructor(
    google: GoogleOAuthProvider,
    microsoft: MicrosoftOAuthProvider,
    slack: SlackOAuthProvider,
    notion: NotionOAuthProvider,
    hubspot: HubspotOAuthProvider,
    github: GithubOAuthProvider,
    instagram: InstagramOAuthProvider,
    whatsapp: WhatsappOAuthProvider,
  ) {
    const m = new Map<string, OAuthProvider>();
    for (const p of [google, microsoft, slack, notion, hubspot, github, instagram, whatsapp]) {
      m.set(p.id, p);
    }
    this.providers = m;
  }

  get(id: string): OAuthProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new BadRequestException(`Unknown OAuth provider: ${id}`);
    }
    return provider;
  }

  list(): readonly OAuthProvider[] {
    return Array.from(this.providers.values());
  }
}
