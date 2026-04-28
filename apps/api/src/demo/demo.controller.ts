import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { DemoService } from './demo.service';
import { DemoSeedResponseDto } from './dto/demo-seed-response.dto';

@ApiTags('demo')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@UseGuards(JwtAuthGuard)
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed presentation-day demo workflows for the authenticated user (idempotent)',
  })
  @ApiOkResponse({ type: DemoSeedResponseDto })
  async seed(@CurrentUser() user: AuthenticatedUser): Promise<DemoSeedResponseDto> {
    return this.demo.seedForUser(user.id);
  }
}
