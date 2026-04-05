import { Injectable } from '@nestjs/common';
import type { INodeExecutor } from '@tietide/sdk';

@Injectable()
export class NodeRegistry {
  private executors = new Map<string, INodeExecutor>();

  register(executor: INodeExecutor): void {
    this.executors.set(executor.type, executor);
  }

  resolve(type: string): INodeExecutor | undefined {
    return this.executors.get(type);
  }

  has(type: string): boolean {
    return this.executors.has(type);
  }

  getAll(): INodeExecutor[] {
    return Array.from(this.executors.values());
  }
}
