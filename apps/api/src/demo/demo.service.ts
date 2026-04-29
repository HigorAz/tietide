import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import {
  DEMO_WORKFLOWS,
  type DemoWebhookConfig,
  type DemoWorkflowFixture,
} from './demo-workflows.fixtures';

export interface SeededDemoWorkflow {
  slug: string;
  workflowId: string;
  name: string;
  isActive: boolean;
  alreadyExisted: boolean;
  webhookPath?: string;
}

export interface DemoSeedResult {
  workflows: SeededDemoWorkflow[];
}

@Injectable()
export class DemoService {
  private readonly log = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async seedForUser(userId: string): Promise<DemoSeedResult> {
    const seeded: SeededDemoWorkflow[] = [];

    for (const fixture of DEMO_WORKFLOWS) {
      seeded.push(await this.seedFixture(userId, fixture));
    }

    return { workflows: seeded };
  }

  private async seedFixture(
    userId: string,
    fixture: DemoWorkflowFixture,
  ): Promise<SeededDemoWorkflow> {
    const existing = await this.prisma.workflow.findFirst({
      where: { userId, name: fixture.name },
      select: { id: true, name: true, isActive: true },
    });

    let workflow: { id: string; name: string; isActive: boolean };
    let alreadyExisted: boolean;

    if (existing) {
      workflow = existing;
      alreadyExisted = true;
    } else {
      const created = await this.prisma.workflow.create({
        data: {
          userId,
          name: fixture.name,
          description: fixture.description,
          definition: fixture.definition as unknown as Prisma.InputJsonValue,
          isActive: fixture.activate,
        },
        select: { id: true, name: true, isActive: true },
      });
      workflow = created;
      alreadyExisted = false;

      await this.audit.log({
        userId,
        action: 'demo.seed',
        resource: 'workflow',
        resourceId: created.id,
        metadata: { slug: fixture.slug, name: fixture.name },
      });
    }

    let webhookPath: string | undefined;
    if (fixture.webhook) {
      webhookPath = await this.ensureWebhook(userId, workflow.id, fixture.webhook);
    }

    return {
      slug: fixture.slug,
      workflowId: workflow.id,
      name: workflow.name,
      isActive: workflow.isActive,
      alreadyExisted,
      webhookPath,
    };
  }

  private async ensureWebhook(
    userId: string,
    workflowId: string,
    config: DemoWebhookConfig,
  ): Promise<string> {
    const existing = await this.prisma.webhook.findFirst({
      where: { workflowId },
      select: { path: true },
    });
    if (existing) {
      return existing.path;
    }

    const path = `${config.pathSuffix}-${userId.slice(0, 8)}`;
    const hmacSecret = randomBytes(32).toString('hex');

    const created = await this.prisma.webhook.create({
      data: {
        workflowId,
        path,
        hmacSecret,
        isActive: true,
      },
      select: { path: true },
    });

    await this.audit.log({
      userId,
      action: 'demo.seed',
      resource: 'webhook',
      resourceId: workflowId,
      metadata: { path },
    });

    return created.path;
  }
}
