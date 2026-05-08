export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: Date;
}

export interface WorkflowTagSummary {
  id: string;
  name: string;
  color: string | null;
}
