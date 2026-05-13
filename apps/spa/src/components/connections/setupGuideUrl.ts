const DEFAULT_DOCS_BASE_URL = 'https://github.com/HigorAz/tietide/blob/main';

export const buildSetupGuideUrl = (repoRelativePath: string): string => {
  const base = (import.meta.env.VITE_DOCS_BASE_URL as string | undefined) ?? DEFAULT_DOCS_BASE_URL;
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedPath = repoRelativePath.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
};
