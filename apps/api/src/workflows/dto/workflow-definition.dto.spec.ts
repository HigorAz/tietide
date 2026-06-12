import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  WorkflowDefinitionDto,
  MAX_WORKFLOW_NODES,
  MAX_WORKFLOW_EDGES,
} from './workflow-definition.dto';

function makeNode(i: number) {
  return {
    id: `n${i}`,
    type: 'manual-trigger',
    name: `Node ${i}`,
    position: { x: 0, y: 0 },
    config: {},
  };
}

function makeEdge(i: number) {
  return { id: `e${i}`, source: 'n0', target: `n${i}` };
}

describe('WorkflowDefinitionDto', () => {
  describe('nodes element-count cap', () => {
    it('passes at the node cap', async () => {
      const nodes = Array.from({ length: MAX_WORKFLOW_NODES }, (_, i) => makeNode(i));
      const dto = plainToInstance(WorkflowDefinitionDto, { nodes, edges: [] });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'nodes')).toBeUndefined();
    });

    it('rejects more nodes than the cap', async () => {
      const nodes = Array.from({ length: MAX_WORKFLOW_NODES + 1 }, (_, i) => makeNode(i));
      const dto = plainToInstance(WorkflowDefinitionDto, { nodes, edges: [] });
      const errors = await validate(dto);
      const nodeErr = errors.find((e) => e.property === 'nodes');
      expect(nodeErr).toBeDefined();
      expect(nodeErr?.constraints).toHaveProperty('arrayMaxSize');
    });
  });

  describe('edges element-count cap', () => {
    it('passes at the edge cap', async () => {
      const edges = Array.from({ length: MAX_WORKFLOW_EDGES }, (_, i) => makeEdge(i + 1));
      const dto = plainToInstance(WorkflowDefinitionDto, { nodes: [], edges });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'edges')).toBeUndefined();
    });

    it('rejects more edges than the cap', async () => {
      const edges = Array.from({ length: MAX_WORKFLOW_EDGES + 1 }, (_, i) => makeEdge(i + 1));
      const dto = plainToInstance(WorkflowDefinitionDto, { nodes: [], edges });
      const errors = await validate(dto);
      const edgeErr = errors.find((e) => e.property === 'edges');
      expect(edgeErr).toBeDefined();
      expect(edgeErr?.constraints).toHaveProperty('arrayMaxSize');
    });
  });
});
