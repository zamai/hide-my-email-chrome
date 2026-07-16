import { build, context } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { watch as watchFiles } from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

const watch = process.argv.includes('--watch');
const root = path.resolve(import.meta.dirname, '..');
const outdir = path.join(root, 'build');

const staticFiles = new Set(['rules.json', 'popup.html', 'popup.css', 'offscreen.html']);

async function overwriteFile(source, destination) {
  await writeFile(destination, await readFile(source));
}

async function syncStaticAssets() {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'src/manifest.json'), 'utf8'));
  await writeFile(
    path.join(outdir, 'manifest.json'),
    JSON.stringify({ version: pkg.version, ...manifest }, null, 2)
  );
  for (const file of staticFiles) {
    await overwriteFile(path.join(root, 'src', file), path.join(outdir, file));
  }
  for (const size of [16, 32, 48, 128]) {
    await overwriteFile(
      path.join(root, `src/assets/img/icon-${size}.png`),
      path.join(outdir, `icon-${size}.png`)
    );
  }
}

await mkdir(outdir, { recursive: true });
await syncStaticAssets();

let reloadTimer;
let reloadServer;

function scheduleExtensionReload() {
  if (!reloadServer) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of reloadServer.clients) {
      if (client.readyState === WebSocket.OPEN) client.send('reload');
    }
  }, 100);
}

const devReloadPlugin = {
  name: 'reload-unpacked-extension',
  setup(esbuild) {
    esbuild.onEnd((result) => {
      if (result.errors.length === 0) scheduleExtensionReload();
    });
  },
};

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
  define: { __DEV__: watch ? 'true' : 'false' },
  plugins: watch ? [devReloadPlugin] : [],
};

if (watch) {
  reloadServer = new WebSocketServer({ host: '127.0.0.1', port: 17345 });
  reloadServer.on('listening', () =>
    console.log('Development reload server listening on ws://127.0.0.1:17345')
  );
  reloadServer.on('connection', (socket) => {
    socket.on('message', (data) => {
      try {
        const diagnostic = JSON.parse(data.toString());
        if (diagnostic.type === 'connected') {
          console.log(`Connected to unpacked extension ${diagnostic.extensionId}.`);
        } else if (diagnostic.type === 'error') {
          console.error('Extension diagnostic:', diagnostic);
        }
      } catch {
        console.error('Ignored malformed extension diagnostic.');
      }
    });
  });

  const ctx = await context(options);
  await ctx.watch();
  watchFiles(path.join(root, 'src'), { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const normalized = filename.toString().replaceAll('\\', '/');
    const isStatic =
      staticFiles.has(normalized) ||
      normalized === 'manifest.json' ||
      normalized.startsWith('assets/img/icon-');
    if (!isStatic) return;
    void syncStaticAssets().then(scheduleExtensionReload);
  });
  console.log(`Watching extension sources in ${outdir}.`);
  console.log(
    'Reload the extension once in chrome://extensions; subsequent builds reload automatically.'
  );
} else {
  await build(options);
}
