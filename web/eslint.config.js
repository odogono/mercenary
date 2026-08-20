import { resolve } from 'node:path';

import nkzw from '@nkzw/eslint-config';

export default [
  {
    ignores: [
      '**/dist/*',
      '**/coverage/*',
      '**/playwright-report/*',
      '**/test-results/*'
    ]
  },
  ...nkzw,
  {
    rules: {
      'arrow-body-style': ['error', 'as-needed'],
      'arrow-parens': ['error', 'as-needed'],
      'arrow-spacing': ['error', { after: true, before: true }],
      'func-style': ['error', 'expression'],
      'import-x/no-namespace': 'off',
      'import-x/no-unresolved': ['error', { ignore: ['^bun:'] }],
      'no-var': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error'
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          project: resolve(process.cwd(), './tsconfig.json')
        }
      }
    }
  },
  {
    files: ['serve.ts'],
    rules: {
      'no-console': 'off'
    }
  }
];
