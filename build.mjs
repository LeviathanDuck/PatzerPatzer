import * as esbuild from 'esbuild';
import * as sass from 'sass';
import fs from 'fs';

// Compile TypeScript
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'public/js/main.js',
  format: 'esm',
  target: 'es2021',
  sourcemap: true,
  logLevel: 'info',
});

// Compile SCSS
fs.mkdirSync('public/css', { recursive: true });
const result = sass.compile('src/styles/main.scss');
fs.writeFileSync('public/css/main.css', result.css);
console.log('  public/css/main.css');
