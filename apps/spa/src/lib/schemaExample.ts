// Walk a Zod schema and produce a realistic placeholder object so a trigger with
// no prior run AND no curated NODE_OUTPUT_EXAMPLES entry still yields a usable
// `{{trigger.*}}` sample. This is the schema-shaped analog of the curated
// examples: objects → nested, arrays → one element, strings → contextual
// placeholders, etc. It is intentionally defensive — any zod type it doesn't
// special-case collapses to `null` so it never throws on an exotic schema.
//
// Keep the path conventions compatible with derive-suggestions.ts / walkSchema:
// the produced sample, when fed to derivePathsFromSample, yields the same field
// paths the picker derives directly from the schema.

import type { z } from 'zod';

const MAX_DEPTH = 6;

interface ZodDefLike {
  typeName: string;
  innerType?: z.ZodTypeAny;
  type?: z.ZodTypeAny;
  getter?: () => z.ZodTypeAny;
  values?: readonly string[];
  options?: z.ZodTypeAny[] | Map<unknown, z.ZodTypeAny>;
  value?: unknown;
  shape?: () => Record<string, z.ZodTypeAny>;
  schema?: z.ZodTypeAny;
  defaultValue?: () => unknown;
}

function def(schema: z.ZodTypeAny): ZodDefLike {
  return schema._def as unknown as ZodDefLike;
}

/** A contextual string placeholder driven by the field key (best-effort). */
function stringFor(key: string | undefined): string {
  if (!key) return 'example';
  const k = key.toLowerCase();
  if (k.includes('email')) return 'user@example.com';
  if (k.endsWith('url') || k.includes('link') || k === 'href') return 'https://example.com';
  if (k.includes('id')) return 'example-id';
  if (k.includes('date') || k.includes('time') || k.endsWith('at')) {
    return '2026-01-01T12:00:00.000Z';
  }
  if (k.includes('name')) return 'Example name';
  if (k.includes('subject') || k.includes('title')) return 'Example subject';
  if (k.includes('status') || k.includes('state')) return 'open';
  return 'example';
}

/**
 * Produce a realistic placeholder value for a Zod schema. Returns `null` for any
 * zod type that isn't recognized so callers always get a serializable value.
 *
 * @param key the object key this schema sits under (drives contextual strings)
 */
export function zodToExample(schema: z.ZodTypeAny, key?: string, depth = 0): unknown {
  if (depth > MAX_DEPTH) return null;
  const d = def(schema);
  switch (d.typeName) {
    case 'ZodObject': {
      const shape = typeof d.shape === 'function' ? d.shape() : {};
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(shape)) {
        out[childKey] = zodToExample(child, childKey, depth + 1);
      }
      return out;
    }
    case 'ZodArray': {
      if (!d.type) return [];
      return [zodToExample(d.type, key, depth + 1)];
    }
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodReadonly': {
      // Include optionals/nullables so their fields are pill-mappable.
      return d.innerType ? zodToExample(d.innerType, key, depth) : null;
    }
    case 'ZodDefault': {
      if (typeof d.defaultValue === 'function') {
        try {
          return d.defaultValue();
        } catch {
          /* fall through to inner */
        }
      }
      return d.innerType ? zodToExample(d.innerType, key, depth) : null;
    }
    case 'ZodEffects': {
      return d.schema ? zodToExample(d.schema, key, depth) : null;
    }
    case 'ZodLazy': {
      if (typeof d.getter === 'function') {
        return zodToExample(d.getter(), key, depth + 1);
      }
      return null;
    }
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const opts = Array.isArray(d.options)
        ? d.options
        : d.options instanceof Map
          ? Array.from(d.options.values())
          : [];
      return opts.length > 0 ? zodToExample(opts[0], key, depth + 1) : null;
    }
    case 'ZodEnum': {
      return d.values && d.values.length > 0 ? d.values[0] : stringFor(key);
    }
    case 'ZodNativeEnum': {
      const vals = Object.values((d as { values?: Record<string, unknown> }).values ?? {});
      return vals.length > 0 ? vals[0] : null;
    }
    case 'ZodLiteral': {
      return d.value ?? null;
    }
    case 'ZodString': {
      return stringFor(key);
    }
    case 'ZodNumber': {
      const k = (key ?? '').toLowerCase();
      return k.includes('count') || k.includes('total') || k.includes('index') ? 1 : 0;
    }
    case 'ZodBoolean': {
      return false;
    }
    case 'ZodDate': {
      return '2026-01-01T12:00:00.000Z';
    }
    case 'ZodRecord':
    case 'ZodMap': {
      return {};
    }
    case 'ZodTuple': {
      const items = (d as { items?: z.ZodTypeAny[] }).items ?? [];
      return items.map((item, i) => zodToExample(item, `${key ?? 'item'}${i}`, depth + 1));
    }
    case 'ZodNull':
      return null;
    case 'ZodUndefined':
    case 'ZodVoid':
      return undefined;
    case 'ZodAny':
    case 'ZodUnknown':
    default:
      return null;
  }
}
