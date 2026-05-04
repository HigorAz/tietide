import { updateWorkflow } from '@/api/workflows';
import { useEditorStore } from '@/stores/editorStore';
import { toWorkflowDefinition } from './serialization';

export async function saveWorkflow(workflowId: string): Promise<void> {
  const { nodes, edges, markSaved } = useEditorStore.getState();
  await updateWorkflow(workflowId, {
    definition: toWorkflowDefinition(nodes, edges),
  });
  markSaved();
}
