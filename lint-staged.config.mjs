// @ts-check

/** @type {import('lint-staged').Config} */
const config = {
  '*.{ts,js,mjs,cjs}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};

export default config;
