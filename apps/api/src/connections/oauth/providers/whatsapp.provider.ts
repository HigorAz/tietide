import { Injectable } from '@nestjs/common';
import {
  ConnectionProvider,
  whatsappOAuth2ConfigSchema,
  type WhatsappOAuth2Config,
} from '@tietide/shared';
import { MetaOAuthProvider } from './meta-base.provider';

// Permissions for sending messages/templates via the WhatsApp Business Cloud
// API. Require Meta App Review + business verification for non-test users.
const DEFAULT_SCOPES = [
  'whatsapp_business_messaging',
  'whatsapp_business_management',
  'business_management',
] as const;

const ALLOWED_SCOPES = new Set(DEFAULT_SCOPES);

@Injectable()
export class WhatsappOAuthProvider extends MetaOAuthProvider {
  readonly id = ConnectionProvider.WHATSAPP;
  readonly displayName = 'WhatsApp';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  protected buildConfig(accessToken: string, scope: string | undefined): WhatsappOAuth2Config {
    return whatsappOAuth2ConfigSchema.parse({ accessToken, scope, tokenType: 'bearer' });
  }
}
