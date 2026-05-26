import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CryptoModule } from '../../crypto/crypto.module';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConnectionsModule } from '../connections.module';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import { GoogleOAuthProvider } from './providers/google.provider';
import { MicrosoftOAuthProvider } from './providers/microsoft.provider';
import { SlackOAuthProvider } from './providers/slack.provider';
import { NotionOAuthProvider } from './providers/notion.provider';
import { HubspotOAuthProvider } from './providers/hubspot.provider';
import { GithubOAuthProvider } from './providers/github.provider';

// ConnectionsService is consumed by OAuthService but NOT re-declared here.
// It lives in ConnectionsModule along with its ProviderHealthRegistry factory
// (one source of truth). ConnectionsModule already imports OAuthModule, so
// forwardRef is required on this side to break the circular reference.
@Module({
  imports: [
    AuthModule,
    CryptoModule,
    AuditModule,
    PrismaModule,
    forwardRef(() => ConnectionsModule),
  ],
  controllers: [OAuthController],
  providers: [
    OAuthService,
    OAuthStateService,
    OAuthProviderRegistry,
    GoogleOAuthProvider,
    MicrosoftOAuthProvider,
    SlackOAuthProvider,
    NotionOAuthProvider,
    HubspotOAuthProvider,
    GithubOAuthProvider,
  ],
})
export class OAuthModule {}
