import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CryptoModule } from '../../crypto/crypto.module';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConnectionsService } from '../connections.service';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import { GoogleOAuthProvider } from './providers/google.provider';
import { MicrosoftOAuthProvider } from './providers/microsoft.provider';
import { SlackOAuthProvider } from './providers/slack.provider';
import { NotionOAuthProvider } from './providers/notion.provider';
import { HubspotOAuthProvider } from './providers/hubspot.provider';

@Module({
  imports: [AuthModule, CryptoModule, AuditModule, PrismaModule],
  controllers: [OAuthController],
  providers: [
    ConnectionsService,
    OAuthService,
    OAuthStateService,
    OAuthProviderRegistry,
    GoogleOAuthProvider,
    MicrosoftOAuthProvider,
    SlackOAuthProvider,
    NotionOAuthProvider,
    HubspotOAuthProvider,
  ],
})
export class OAuthModule {}
