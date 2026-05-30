import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** Default cap for an inline trigger payload (64 KiB). */
export const DEFAULT_TRIGGER_DATA_MAX_BYTES = 64 * 1024;

/**
 * Byte size of a value's JSON serialization (UTF-8). `undefined`/unserializable
 * values count as 0 so optional fields pass.
 */
export function serializedByteLength(value: unknown): number {
  if (value === undefined) return 0;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    // Circular / non-serializable — treat as oversized so it is rejected.
    return Number.POSITIVE_INFINITY;
  }
  if (json === undefined) return 0;
  return Buffer.byteLength(json, 'utf8');
}

/**
 * Validation decorator: rejects a property whose JSON serialization exceeds
 * `maxBytes`. Bounds an unbounded JSONB field (e.g. triggerData) before it is
 * persisted and forwarded to the worker.
 */
export function MaxSerializedBytes(
  maxBytes: number = DEFAULT_TRIGGER_DATA_MAX_BYTES,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxSerializedBytes',
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return serializedByteLength(value) <= maxBytes;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} exceeds the maximum size of ${maxBytes} bytes`;
        },
      },
    });
  };
}
