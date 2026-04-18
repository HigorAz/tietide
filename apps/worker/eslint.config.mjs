import { baseConfig } from '@tietide/eslint-config';

export default [
  ...baseConfig,
  {
    // Nest DI reads constructor parameter types at runtime via
    // emitDecoratorMetadata, so injected classes must be value imports.
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
