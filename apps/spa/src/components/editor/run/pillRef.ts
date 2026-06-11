import { TRIGGER_ALIAS } from '@tietide/shared';

/**
 * Derive a data-pill ref root from an editor node's stable alias, mirroring
 * `refForAlias` in upstream-schema.ts. The trigger keeps the bare `trigger`
 * root; every other node becomes `steps.<alias>`. A missing alias yields
 * `undefined` so the DataViewer simply omits its path-copy buttons (graceful).
 */
export function pillRefForAlias(alias: string | undefined): string | undefined {
  if (alias === undefined) return undefined;
  return alias === TRIGGER_ALIAS ? TRIGGER_ALIAS : `steps.${alias}`;
}
