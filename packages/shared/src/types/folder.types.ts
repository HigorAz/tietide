export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: Date;
}
