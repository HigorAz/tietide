import { Injectable } from '@nestjs/common';
import {
  ConnectionProvider,
  instagramOAuth2ConfigSchema,
  type InstagramOAuth2Config,
} from '@tietide/shared';
import { MetaOAuthProvider } from './meta-base.provider';

// Permissions for publishing photos to an Instagram Business account and reading
// its comments. All require Meta App Review + business verification before they
// work for non-test users (documented in docs/deployment.md).
const DEFAULT_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'business_management',
] as const;

const ALLOWED_SCOPES = new Set([...DEFAULT_SCOPES, 'instagram_manage_comments']);

@Injectable()
export class InstagramOAuthProvider extends MetaOAuthProvider {
  readonly id = ConnectionProvider.INSTAGRAM;
  readonly displayName = 'Instagram';
  readonly defaultScopes: readonly string[] = DEFAULT_SCOPES;
  readonly allowedScopes: ReadonlySet<string> = ALLOWED_SCOPES;

  protected buildConfig(accessToken: string, scope: string | undefined): InstagramOAuth2Config {
    return instagramOAuth2ConfigSchema.parse({ accessToken, scope, tokenType: 'bearer' });
  }
}
