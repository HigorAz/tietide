import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { findUnsafeConfigIssue } from '@tietide/shared';

/**
 * Validation decorator: rejects a node `config` object that carries a
 * prototype-pollution key (`__proto__`/`constructor`/`prototype`) or nests
 * beyond the safe depth. Defense-in-depth at the HTTP boundary so the dry-run
 * `test` endpoint — which never reaches the executable-schema save gate — cannot
 * forward an unsafe config to the worker. Reuses the shared walker so the rule
 * is defined once.
 */
export function IsSafeNodeConfig(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeNodeConfig',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return findUnsafeConfigIssue(value) === null;
        },
        defaultMessage(args: ValidationArguments) {
          const issue = findUnsafeConfigIssue(
            (args.object as Record<string, unknown>)[args.property],
          );
          return issue
            ? `${args.property}: ${issue.message}`
            : `${args.property} contains an unsafe value`;
        },
      },
    });
  };
}
