import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
 { ignores: ['.next/**','node_modules/**','src/core.js','tests/core.test.mjs'] },
 js.configs.recommended, ...tseslint.configs.recommended,
 { rules: { '@typescript-eslint/no-unused-vars': ['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}] } }
);
