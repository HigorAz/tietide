import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import type { OrgContext } from '../../common/org-context/org-context.types';
import { StartOAuthDto } from './dto/start-oauth.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { StartOAuthResponseDto } from './dto/start-oauth-response.dto';
import { OAuthCallbackError, OAuthService } from './oauth.service';

@ApiTags('connections')
@Controller('connections/oauth')
export class OAuthController {
  private readonly log = new Logger(OAuthController.name);

  constructor(private readonly oauth: OAuthService) {}

  @Get('start')
  @UseGuards(JwtAuthGuard, OrgContextGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Begin an OAuth2 authorization flow for a provider' })
  @ApiOkResponse({ type: StartOAuthResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown provider or disallowed scope' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  async start(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: StartOAuthDto,
  ): Promise<StartOAuthResponseDto> {
    const { redirectUrl, state } = await this.oauth.start(org.id, user.id, {
      provider: dto.provider,
      scopes: dto.scopes,
      label: dto.label,
    });
    return { redirectUrl, state };
  }

  @Get('callback')
  @HttpCode(HttpStatus.FOUND)
  @ApiOperation({
    summary: 'OAuth2 callback (public — invoked by provider auth server)',
    description: 'Validates state JWT, exchanges code for tokens, redirects to SPA.',
  })
  @ApiFoundResponse({ description: 'Redirect to SPA /connections with status query params' })
  async callback(@Query() dto: OAuthCallbackDto, @Res() res: Response): Promise<void> {
    try {
      const result = await this.oauth.handleCallback({
        provider: dto.provider,
        code: dto.code,
        state: dto.state,
        error: dto.error,
      });
      res.redirect(HttpStatus.FOUND, this.oauth.successRedirectUrl(result.connectionId));
    } catch (err) {
      const message = this.toClientErrorMessage(err);
      this.log.warn(
        { provider: dto.provider, err: err instanceof Error ? err.message : String(err) },
        'OAuth callback failed',
      );
      res.redirect(HttpStatus.FOUND, this.oauth.errorRedirectUrl(message));
    }
  }

  private toClientErrorMessage(err: unknown): string {
    if (err instanceof OAuthCallbackError) {
      return err.providerErrorCode;
    }
    if (err instanceof BadRequestException) {
      const response = err.getResponse();
      if (typeof response === 'string') return response;
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response &&
        typeof (response as { message: unknown }).message === 'string'
      ) {
        return (response as { message: string }).message;
      }
      return err.message;
    }
    return 'oauth_failed';
  }
}
