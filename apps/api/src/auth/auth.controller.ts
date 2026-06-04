import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_TTL_MS,
  DEFAULT_THROTTLER_NAME,
} from '../common/throttler/throttler.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ForgotPasswordResponseDto } from './dto/forgot-password-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({
    [DEFAULT_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
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
    [DEFAULT_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
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
    [DEFAULT_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
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
    [DEFAULT_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
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
    [DEFAULT_THROTTLER_NAME]: {
      ttl: DEFAULT_AUTH_THROTTLE_TTL_MS,
      limit: DEFAULT_AUTH_THROTTLE_LIMIT,
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
