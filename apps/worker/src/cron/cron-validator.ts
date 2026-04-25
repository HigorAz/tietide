const FIELD = /^(\*|\d+|\d+-\d+|\*\/\d+|\d+\/\d+)(,(\*|\d+|\d+-\d+|\*\/\d+|\d+\/\d+))*$/;

export function isValidCron(expression: string): boolean {
  if (typeof expression !== 'string' || expression.trim().length === 0) {
    return false;
  }

  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  return fields.every((field) => FIELD.test(field));
}
