import { Module } from '@nestjs/common';
import { EnvVarsController } from './env-vars.controller';
import { AdminEnvVarsController } from './admin-env-vars.controller';
import { EnvVarsService } from './env-vars.service';

@Module({
  controllers: [EnvVarsController, AdminEnvVarsController],
  providers: [EnvVarsService],
  exports: [EnvVarsService],
})
export class EnvVarsModule {}
