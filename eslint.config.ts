import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['out/**', 'node_modules/**', 'dist/**', 'release/**'] },

  // All TypeScript files — TypeScript + general + import rules
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'scripts/**/*.ts'],
    extends: [tseslint.configs.recommended],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ['tsconfig.node.json', 'tsconfig.web.json'],
        },
      },
    },
    rules: {
      // Keep in alphabetical order

      // @typescript-eslint
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/default-param-last': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['warn', 'type'],
      '@typescript-eslint/no-empty-interface': ['warn', { allowSingleExtends: true }],
      '@typescript-eslint/no-empty-object-type': [
        'warn',
        { allowInterfaces: 'with-single-extends' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-shadow': 'warn',
      '@typescript-eslint/no-unnecessary-type-constraint': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-use-before-define': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',

      // import
      'import/export': 'warn',
      'import/extensions': ['warn', 'ignorePackages', {}],
      'import/first': 'warn',
      'import/newline-after-import': 'warn',
      'import/no-cycle': 'warn',
      'import/no-default-export': 'warn',
      'import/no-duplicates': 'warn',
      'import/no-extraneous-dependencies': ['warn', { devDependencies: true }],
      'import/no-mutable-exports': 'warn',
      'import/no-unresolved': ['error', { ignore: ['^virtual:', '^electron$', '^electron/'] }],
      'import/no-useless-path-segments': 'warn',
      'import/order': 'off', // handled by @trivago/prettier-plugin-sort-imports
      'import/prefer-default-export': 'off',

      // General ESLint
      'array-callback-return': 'warn',
      'arrow-body-style': 'warn',
      camelcase: 'warn',
      'class-methods-use-this': 'warn',
      'consistent-return': 'warn',
      'default-case': 'warn',
      'default-case-last': 'warn',
      eqeqeq: 'warn',
      'func-style': ['warn', 'expression'],
      'guard-for-in': 'warn',
      'lines-between-class-members': ['warn', 'always', { exceptAfterSingleLine: true }],
      'max-classes-per-file': 'off',
      'no-await-in-loop': 'warn',
      'no-case-declarations': 'warn',
      'no-compare-neg-zero': 'warn',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-constant-binary-expression': 'warn',
      'no-constant-condition': 'warn',
      'no-continue': 'warn',
      'no-dupe-else-if': 'warn',
      'no-dupe-keys': 'warn',
      'no-duplicate-case': 'warn',
      'no-else-return': ['warn', { allowElseIf: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-empty-function': 'warn',
      'no-empty-pattern': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-fallthrough': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-lone-blocks': 'warn',
      'no-lonely-if': 'warn',
      'no-multi-assign': 'warn',
      'no-nested-ternary': 'warn',
      'no-param-reassign': 'warn',
      'no-plusplus': 'off',
      'no-restricted-properties': 'warn',
      'no-restricted-syntax': 'warn',
      'no-return-assign': 'warn',
      'no-self-compare': 'warn',
      'no-sequences': 'warn',
      'no-template-curly-in-string': 'warn',
      'no-undef': 'error',
      'no-undef-init': 'warn',
      'no-underscore-dangle': 'off',
      'no-unexpected-multiline': 'warn',
      'no-unneeded-ternary': 'warn',
      'no-unreachable': 'warn',
      'no-unreachable-loop': 'warn',
      'no-unsafe-optional-chaining': 'warn',
      'no-useless-computed-key': 'warn',
      'no-useless-constructor': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-rename': 'warn',
      'no-useless-return': 'warn',
      'no-void': 'warn',
      'object-shorthand': 'warn',
      'one-var': 'off',
      'operator-assignment': 'warn',
      'prefer-arrow-callback': 'warn',
      'prefer-const': 'warn',
      'prefer-destructuring': 'warn',
      'prefer-exponentiation-operator': 'off',
      'prefer-object-spread': 'warn',
      'prefer-regex-literals': 'warn',
      'prefer-template': 'warn',
      radix: 'warn',
      'spaced-comment': ['warn', 'always', { markers: ['/'] }],
      yoda: 'warn',

      // Disabled — handled by @typescript-eslint equivalents
      'default-param-last': 'off',
      'dot-notation': 'off',
      'no-shadow': 'off',
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
    },
  },

  // Main process + shared + scripts — Node.js environment
  {
    files: ['src/main/**/*.ts', 'src/shared/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Preload — Node.js + browser globals (contextBridge spans both)
  {
    files: ['src/preload/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  // Renderer — browser environment + React + jsx-a11y rules
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    extends: [reactHooksPlugin.configs.flat.recommended],
    plugins: {
      react: reactPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,

      // jsx-a11y
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/aria-role': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/control-has-associated-label': 'warn',
      'jsx-a11y/iframe-has-title': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',

      // React
      'react/button-has-type': 'warn',
      'react/destructuring-assignment': 'warn',
      'react/display-name': 'off',
      'react/function-component-definition': [
        'warn',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'react/jsx-boolean-value': 'warn',
      'react/jsx-curly-brace-presence': 'warn',
      'react/jsx-filename-extension': ['warn', { extensions: ['.jsx', '.tsx'] }],
      'react/jsx-fragments': 'warn',
      'react/jsx-key': ['warn', { checkFragmentShorthand: true }],
      'react/jsx-no-bind': 'off',
      'react/jsx-no-constructed-context-values': 'warn',
      'react/jsx-no-useless-fragment': 'warn',
      'react/jsx-props-no-spreading': 'off',
      'react/no-array-index-key': 'warn',
      'react/no-children-prop': 'warn',
      'react/no-deprecated': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/no-unknown-property': 'warn',
      'react/no-unstable-nested-components': 'warn',
      'react/no-unused-prop-types': 'warn',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/require-default-props': 'off',
      'react/self-closing-comp': 'warn',
      'react-hooks/exhaustive-deps': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // Scripts — override no-console (scripts log to stdout intentionally)
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Prettier — must be last to disable conflicting formatting rules
  prettierConfig,

  // src/shared/types/sse.ts uses snake_case object keys to match the OpenCode wire protocol
  {
    files: ['src/shared/types/sse.ts'],
    rules: { camelcase: 'off' },
  },

  // Declaration-merging files must use interface — type cannot augment existing declarations
  {
    files: ['src/renderer/src/styled.d.ts', 'src/shared/types/ipc.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },

  // Test files — relax rules that conflict with test patterns
  // class-methods-use-this: mock classes legitimately close over external state (vi.hoisted refs)
  {
    files: [
      'src/**/__tests__/**/*.ts',
      'src/**/__tests__/**/*.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    languageOptions: {
      globals: {
        // vitest globals (mirrors globals: true in vitest.config.web.ts)
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        // React is in scope via @vitejs/plugin-react JSX transform
        React: 'readonly',
      },
    },
    rules: {
      'class-methods-use-this': 'off',
      // Test helper components don't need button type attributes
      'react/button-has-type': 'off',
    },
  },
);
