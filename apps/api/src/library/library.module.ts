import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [BillingModule],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
