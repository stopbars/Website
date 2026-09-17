import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const packageRoot = path.resolve(
  process.argv[2] ||
    'C:/Users/scorc/AppData/Roaming/Microsoft Flight Simulator 2024/Packages/Community/flytampagg-sydney'
);
const outputDirectory = path.resolve(
  process.argv[3] || path.join(projectRoot, 'diagnostics/msfs-render-verification')
);
const airportIcao = String(process.argv[4] || 'YSSY').toUpperCase();
const projectedMeshBasisOverride = String(process.argv[5] || '');
const packageName = path.basename(packageRoot);
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const packageInfo = await stat(packageRoot);
if (!packageInfo.isDirectory()) throw new Error(`MSFS package directory not found: ${packageRoot}`);
await mkdir(outputDirectory, { recursive: true });
const entries = [];
await collectEntries(packageRoot, '');

const packageServer = createHttpServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  const requestUrl = new URL(request.url, 'http://127.0.0.1');
  if (requestUrl.pathname === '/manifest') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ entries }));
    return;
  }
  if (requestUrl.pathname !== '/file') {
    response.statusCode = 404;
    response.end('Not found');
    return;
  }
  const relativePath = String(requestUrl.searchParams.get('path') || '').replaceAll('/', path.sep);
  const absolutePath = path.resolve(packageRoot, relativePath);
  const relativeTarget = path.relative(packageRoot, absolutePath);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    response.statusCode = 403;
    response.end('Invalid package path');
    return;
  }
  createReadStream(absolutePath)
    .on('error', () => {
      if (!response.headersSent) response.statusCode = 404;
      response.end('File unavailable');
    })
    .pipe(response);
});
await listen(packageServer, 0);
const packagePort = packageServer.address().port;
const vite = await createViteServer({
  root: projectRoot,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port: 0 },
});
await vite.listen();
const vitePort = vite.httpServer.address().port;
const browser = await chromium.launch({ headless: true, executablePath: edgePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.stack || error.message}`));
  const url =
    `http://127.0.0.1:${vitePort}/scripts/msfs-render-verify.html?` +
    `packageOrigin=${encodeURIComponent(`http://127.0.0.1:${packagePort}`)}` +
    `&icao=${encodeURIComponent(airportIcao)}` +
    `&packageName=${encodeURIComponent(packageName)}` +
    `&projectedMeshBasis=${encodeURIComponent(projectedMeshBasisOverride)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    () => ['complete', 'error'].includes(window.verifyState?.phase),
    undefined,
    { timeout: 10 * 60_000 }
  );
  const state = await page.evaluate(() => window.verifyState);
  if (state.phase !== 'complete') {
    throw new Error(`Browser render failed: ${JSON.stringify(state.errors)}`);
  }

  await page.evaluate(() => window.verifyMap.fitBounds(window.verifyMap.getBounds(), { duration: 0 }));
  await page.waitForFunction(() => (window.verifyLayer?.getStats().drawnGroups || 0) > 0);
  await page.screenshot({
    path: path.join(outputDirectory, 'overview.png'),
    fullPage: true,
  });

  await page.evaluate(() => {
    window.verifyMap.jumpTo({ center: window.verifyCenter, zoom: 17.25, bearing: 0, pitch: 0 });
    window.verifyMap.triggerRepaint();
  });
  await page.waitForFunction(() => (window.verifyLayer?.getStats().drawnGroups || 0) > 0);
  await page.screenshot({
    path: path.join(outputDirectory, 'close.png'),
    fullPage: true,
  });

  await page.evaluate(() => window.openEditorVerification());
  await page.waitForFunction(
    () => {
      const stats = window.editorVerificationLayer?.getStats();
      return stats && stats.drawableGroups === stats.meshGroups && stats.drawnGroups > 0;
    },
    undefined,
    { timeout: 2 * 60_000 }
  );
  await page.screenshot({
    path: path.join(outputDirectory, 'editor.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    window.editorVerificationLayer.map.jumpTo({
      center: window.verifyCenter,
      zoom: 17.25,
      bearing: 0,
      pitch: 0,
    });
    window.editorVerificationLayer.map.triggerRepaint();
  });
  await page.waitForFunction(
    () => (window.editorVerificationLayer?.getStats().drawnTriangles || 0) > 100_000
  );
  await page.screenshot({
    path: path.join(outputDirectory, 'editor-close.png'),
    fullPage: true,
  });

  const finalState = await page.evaluate(() => ({
    ...window.verifyState,
    previewStats: window.verifyLayer.getStats(),
    editorStats: window.editorVerificationLayer.getStats(),
    runways: window.verifySource.runways,
    groupSummary: window.verifyBundle.groups.map(({ vertices, ...group }) => group),
  }));
  const report = {
    packageRoot,
    files: entries.length,
    generatedAt: new Date().toISOString(),
    browser: await browser.version(),
    state: finalState,
    consoleMessages,
  };
  await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await vite.close();
  await closeServer(packageServer);
}

async function collectEntries(directory, relativeDirectory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory.replaceAll('\\', '/'), item.name);
    const absolutePath = path.join(directory, item.name);
    if (item.isDirectory()) {
      await collectEntries(absolutePath, relativePath);
      continue;
    }
    if (!item.isFile()) continue;
    const info = await stat(absolutePath);
    entries.push({
      path: relativePath,
      name: item.name,
      size: info.size,
      lastModified: info.mtimeMs,
    });
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}
