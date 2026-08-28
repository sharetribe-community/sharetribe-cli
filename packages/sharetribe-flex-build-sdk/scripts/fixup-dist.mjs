/**
 * Stamps a `type` marker into each build output directory.
 *
 * The package itself is `"type": "module"`, so Node would treat every emitted
 * `.js` file as ESM, including the CommonJS build. A per-directory package.json
 * overrides that for its subtree, which lets both builds keep plain `.js`
 * extensions instead of needing `.mjs`/`.cjs`.
 */
import { writeFileSync } from 'node:fs';

for (const [dir, type] of [
  ['dist/esm', 'module'],
  ['dist/cjs', 'commonjs'],
]) {
  writeFileSync(`${dir}/package.json`, `${JSON.stringify({ type }, null, 2)}\n`);
}
