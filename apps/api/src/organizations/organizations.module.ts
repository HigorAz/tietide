import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { BillingModule } from '../billing/billing.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationMembersController } from './organization-members.controller';
import { OrganizationInvitesController } from './organization-invites.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationInvitesService } from './organization-invites.service';
import { OrganizationAccessService } from './organization-access.service';

@Module({
  imports: [MailerModule, BillingModule],
  controllers: [
    OrganizationsController,
    OrganizationMembersController,
    OrganizationInvitesController,
  ],
  providers: [OrganizationsService, OrganizationInvitesService, OrganizationAccessService],
  exports: [OrganizationsService, OrganizationAccessService],
})
export class OrganizationsModule {}
