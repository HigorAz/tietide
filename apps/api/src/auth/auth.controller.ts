import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AUTH_THROTTLER_NAME,
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_TTL_MS,
  DEFAULT_IP_THROTTLE_LIMIT,
  DEFAULT_IP_THROTTLE_TTL_MS,
  IP_THROTTLER_NAME,
} from '../common/throttler/throttler.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ForgotPasswordResponseDto } from './dto/forgot-password-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
  ) {}

  @Post('register')
  @Throttle({
    // W5.8: env-tunable per-account auth cap. Buckets on the default (per-user /
    // per-(ip,email)) tracker; the guard substitutes the env-resolved limit/ttl so
    // THROTTLE_AUTH_LIMIT / THROTTLE_AUTH_TTL_MS actually take effect at runtime. The
    // values below are the opt-in marker + compile-time fallback only.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
    // W5.9: aggregate per-IP cap layered on top so one IP cannot rotate the email
    // field to spray past the per-(ip,email) bucket.
    [IP_THROTTLER_NAME]: {
      ttl: DEFAULT_IP_THROTTLE_TTL_MS,
      limit: DEFAULT_IP_THROTTLE_LIMIT,
    },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register a new user — emails a verification link; returns a neutral message',
  })
  @ApiAcceptedResponse({ type: RegisterResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @Throttle({
    // W5.8: env-tunable per-account auth cap. Buckets on the default (per-user /
    // per-(ip,email)) tracker; the guard substitutes the env-resolved limit/ttl so
    // THROTTLE_AUTH_LIMIT / THROTTLE_AUTH_TTL_MS actually take effect at runtime. The
    // values below are the opt-in marker + compile-time fallback only.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
    // W5.9: aggregate per-IP cap bounds token-guessing sprays from one source IP.
    [IP_THROTTLER_NAME]: {
      ttl: DEFAULT_IP_THROTTLE_TTL_MS,
      limit: DEFAULT_IP_THROTTLE_LIMIT,
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an email via the emailed token — activates the account and logs in',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or expired verification token' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<LoginResponseDto> {
    return this.authService.verifyEmail(dto);
  }

  @Post('forgot-password')
  @Throttle({
    // W5.8: env-tunable per-account auth cap. Buckets on the default (per-user /
    // per-(ip,email)) tracker; the guard substitutes the env-resolved limit/ttl so
    // THROTTLE_AUTH_LIMIT / THROTTLE_AUTH_TTL_MS actually take effect at runtime. The
    // values below are the opt-in marker + compile-time fallback only.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
    // W5.9: aggregate per-IP cap bounds email-rotation sprays from one source IP.
    [IP_THROTTLER_NAME]: {
      ttl: DEFAULT_IP_THROTTLE_TTL_MS,
      limit: DEFAULT_IP_THROTTLE_LIMIT,
    },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset — emails a reset link; returns a neutral message',
  })
  @ApiAcceptedResponse({ type: ForgotPasswordResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ForgotPasswordResponseDto> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({
    // W5.8: env-tunable per-account auth cap. Buckets on the default (per-user /
    // per-(ip,email)) tracker; the guard substitutes the env-resolved limit/ttl so
    // THROTTLE_AUTH_LIMIT / THROTTLE_AUTH_TTL_MS actually take effect at runtime. The
    // values below are the opt-in marker + compile-time fallback only.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
    // W5.9: aggregate per-IP cap bounds reset-token-guessing sprays from one source IP.
    [IP_THROTTLER_NAME]: {
      ttl: DEFAULT_IP_THROTTLE_TTL_MS,
      limit: DEFAULT_IP_THROTTLE_LIMIT,
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset a password via the emailed token — sets the password and logs in',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or expired reset token' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<LoginResponseDto> {
    return this.authService.resetPassword(dto);
  }

  @Post('login')
  @Throttle({
    // W5.8: env-tunable per-account auth cap. Buckets on the default (per-user /
    // per-(ip,email)) tracker; the guard substitutes the env-resolved limit/ttl so
    // THROTTLE_AUTH_LIMIT / THROTTLE_AUTH_TTL_MS actually take effect at runtime. The
    // values below are the opt-in marker + compile-time fallback only.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
    // W5.9: aggregate per-IP cap so one IP cannot spray one password across many
    // distinct emails by rotating the email field past the per-(ip,email) bucket.
    [IP_THROTTLER_NAME]: {
      ttl: DEFAULT_IP_THROTTLE_TTL_MS,
      limit: DEFAULT_IP_THROTTLE_LIMIT,
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email + password' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiForbiddenResponse({ description: 'Email not verified' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.authService.getProfile(user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the current user’s display name' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.accountService.updateProfile(user.id, dto.name);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @Throttle({
    // W5.50: changePassword runs an online bcrypt.compare against the current
    // password, so a stolen session could brute-force it. Opt into the same
    // env-tunable auth-tier cap (THROTTLE_AUTH_*) as every other credential route
    // instead of falling back to the 100/min global default.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password — revokes every other session and re-issues this one',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid token or wrong current password' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<LoginResponseDto> {
    return this.accountService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Post('resend-verification')
  @Throttle({
    // W5.8: env-tunable per-account auth cap. Buckets on the default (per-user /
    // per-(ip,email)) tracker; the guard substitutes the env-resolved limit/ttl so
    // THROTTLE_AUTH_LIMIT / THROTTLE_AUTH_TTL_MS actually take effect at runtime. The
    // values below are the opt-in marker + compile-time fallback only.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
    // W5.9: aggregate per-IP cap bounds email-rotation sprays from one source IP.
    [IP_THROTTLER_NAME]: {
      ttl: DEFAULT_IP_THROTTLE_TTL_MS,
      limit: DEFAULT_IP_THROTTLE_LIMIT,
    },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Re-send the email-verification link — returns a neutral message',
  })
  @ApiAcceptedResponse({ type: RegisterResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<RegisterResponseDto> {
    return this.accountService.resendVerification(dto.email);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @Throttle({
    // W5.8: env-tunable per-account auth cap. Buckets on the default (per-user /
    // per-(ip,email)) tracker; the guard substitutes the env-resolved limit/ttl so
    // THROTTLE_AUTH_LIMIT / THROTTLE_AUTH_TTL_MS actually take effect at runtime. The
    // values below are the opt-in marker + compile-time fallback only.
    [AUTH_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
    },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete the current account — anonymizes the user and winds down workspaces',
  })
  @ApiNoContentResponse({ description: 'Account deleted' })
  @ApiBadRequestResponse({ description: 'Blocked — last SUPERADMIN of a shared workspace' })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid token or wrong password' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.accountService.deleteAccount(user.id, dto.password);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out — revokes every outstanding token for this user' })
  @ApiNoContentResponse({ description: 'Tokens revoked' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.id);
  }
}
