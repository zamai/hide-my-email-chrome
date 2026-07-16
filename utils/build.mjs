import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const root = path.resolve(import.meta.dirname, '..');
const outdir = path.join(root, 'build');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'src/manifest.json'), 'utf8'));
await writeFile(
  path.join(outdir, 'manifest.json'),
  JSON.stringify({ version: pkg.version, ...manifest }, null, 2)
);

for (const file of ['rules.json', 'popup.html', 'popup.css', 'offscreen.html']) {
  await cp(path.join(root, 'src', file), path.join(outdir, file));
}
for (const size of [16, 32, 48, 128]) {
  await cp(
    path.join(root, `src/assets/img/icon-${size}.png`),
    path.join(outdir, `icon-${size}.png`)
  );
}

const options = {
  entryPoints: {
    background: path.join(root, 'src/background.ts'),
    popup: path.join(root, 'src/popup.ts'),
    offscreen: path.join(root, 'src/offscreen.ts'),
  },
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir,
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log(`Watching extension sources. Load ${outdir} as an unpacked extension.`);
} else {
  await build(options);
}
