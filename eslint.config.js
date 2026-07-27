import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

// Flat config, ESLint 9. The project used to extend airbnb-base, which has no
// flat-config build; these are the rules from it that actually earned their keep
// here, plus the import checks that matter for an ES module package.
export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'assets/**']
  },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    plugins: { import: importPlugin },
    languageOptions: {
      // 'latest' so import attributes (`with { type: 'json' }`) parse.
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node }
    },
    settings: {
      'import/resolver': { node: { extensions: ['.js', '.json'] } }
    },
    rules: {
      // Relative imports need a file extension under ESM. Getting this wrong is
      // not a style nit here: it throws ERR_MODULE_NOT_FOUND at runtime.
      'import/extensions': ['error', 'ignorePackages'],
      'import/no-unresolved': ['error', { commonjs: false }],
      'import/no-duplicates': 'error',
      'import/first': 'error',

      // Correctness beyond eslint:recommended.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-shadow': 'error',
      'consistent-return': 'error',
      'no-console': 'error',

      // House style, matching the existing source.
      indent: ['error', 2, { SwitchCase: 1 }],
      // indent alone does not ban tabs, and this file had stray tab-indented lines.
      'no-tabs': 'error',
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'space-before-function-paren': ['error', {
        anonymous: 'always', named: 'never', asyncArrow: 'always'
      }],
      'arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
      'max-len': ['error', 100, 2, { ignoreUrls: true, ignoreRegExpLiterals: true }],
      'eol-last': ['error', 'always'],
      'no-trailing-spaces': 'error',
      'keyword-spacing': 'error',
      'space-infix-ops': 'error'
    }
  },

  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha }
    },
    rules: {
      // chai assertions are expressions, and tests reach into bot internals.
      'no-unused-expressions': 'off',
      'func-names': 'off'
    }
  }
];
