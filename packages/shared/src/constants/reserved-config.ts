/**
 * Reserved node-config keys that the editor stores on a node but which must
 * never reach a node executor's params. They are namespaced with a `__` prefix
 * so they cannot collide with a real connector config field.
 *
 * `__pillSample`: a user-declared (or test-captured) output JSON sample. It is
 * the highest-priority source for the data-pill picker (#257/#259) but feeds
 * ONLY the picker — the worker strips it in `buildInput` so execution always
 * uses real runtime output.
 */
export const PILL_SAMPLE_KEY = '__pillSample';

export const RESERVED_CONFIG_KEYS = [PILL_SAMPLE_KEY] as const;

export type ReservedConfigKey = (typeof RESERVED_CONFIG_KEYS)[number];
