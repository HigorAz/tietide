/** Trigger a browser download for an in-memory blob. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, jsonString: string): void {
  downloadBlob(filename, new Blob([jsonString], { type: 'application/json' }));
}
