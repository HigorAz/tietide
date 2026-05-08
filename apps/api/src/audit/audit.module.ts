import { Global, Module } from '@nestjs/common';
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AuditLogService } from './audit-log.service';

@Global()
@Module({
  controllers: [AdminAuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
