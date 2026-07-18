import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://localhost:5173';
const OUTPUT_DIR = 'performance-traces';
const SETTLE_MS = 3000;
const NETWORK_IDLE_TIMEOUT_MS = 30000;

const targetUrl = normalizeTargetUrl(process.argv[2] ?? DEFAULT_URL);
const traceName = sanitizeTraceName(process.argv[3] ?? deriveTraceName(targetUrl));
const capturedAt = new Date();
const timestamp = capturedAt.toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve(process.cwd(), OUTPUT_DIR);
const tracePath = path.join(outputDir, `${timestamp}-${traceName}.json`);
const summaryPath = path.join(outputDir, `${timestamp}-${traceName}.summary.json`);
const storageStatePath = await resolveStorageStatePath(process.env.BARS_TRACE_STORAGE_STATE);

await mkdir(outputDir, { recursive: true });

let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  const tracingComplete = waitForTracingComplete(client);

  await client.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-devtools.timeline.stack',
      'blink.user_timing',
      'loading',
      'v8.execute',
      'toplevel',
    ].join(','),
    options: 'sampling-frequency=10000',
    transferMode: 'ReturnAsStream',
  });

  const response = await page.goto(targetUrl, {
    timeout: 60000,
    waitUntil: 'domcontentloaded',
  });

  const networkidle = await waitForNetworkIdle(page);
  await page.waitForTimeout(SETTLE_MS);
  const pageMetrics = await collectPageMetrics(page);

  await client.send('Tracing.end');
  const { stream } = await tracingComplete;
  const traceText = await readProtocolStream(client, stream);
  await writeFile(tracePath, traceText, 'utf8');

  const trace = parseTrace(traceText);
  const summary = {
    url: targetUrl,
    captureTimestamp: capturedAt.toISOString(),
    documentTitle: pageMetrics.title,
    httpStatus: response?.status() ?? null,
    navigationTiming: pageMetrics.navigationTiming,
    paintTimings: pageMetrics.paintTimings,
    resources: pageMetrics.resources,
    networkidle,
    longTasks: summarizeLongTasks(pageMetrics.longTasks, trace),
    storageStateFile: storageStatePath,
    fullTraceFile: tracePath,
    notes: [
      'Open the full trace JSON in Chrome DevTools Performance panel or chrome://tracing for detailed analysis.',
      'The summary is intended for quick triage; inspect the full trace when timings or long tasks need source-level confirmation.',
    ],
  };

  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`Trace saved: ${tracePath}`);
  console.log(`Summary saved: ${summaryPath}`);
} finally {
  await browser?.close();
}

function deriveTraceName(urlText) {
  try {
    const url = new URL(urlText, DEFAULT_URL);
    const pathName = url.pathname.replace(/^\/+|\/+$/g, '');
    return pathName.length > 0 ? pathName.replace(/\//g, '-') : 'home';
  } catch {
    return 'trace';
  }
}

function normalizeTargetUrl(urlText) {
  return new URL(urlText, DEFAULT_URL).toString();
}

function sanitizeTraceName(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trace'
  );
}

async function resolveStorageStatePath(storageState) {
  if (!storageState) return null;

  const resolvedPath = path.resolve(process.cwd(), storageState);

  try {
    await access(resolvedPath);
    return resolvedPath;
  } catch {
    throw new Error(`BARS_TRACE_STORAGE_STATE points to a missing file: ${resolvedPath}`);
  }
}

async function waitForNetworkIdle(page) {
  try {
    await page.waitForLoadState('networkidle', {
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    });

    return { reached: true, timeoutMs: NETWORK_IDLE_TIMEOUT_MS };
  } catch (error) {
    return {
      reached: false,
      timeoutMs: NETWORK_IDLE_TIMEOUT_MS,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    const paintEntries = performance.getEntriesByType('paint');
    const resourceEntries = performance.getEntriesByType('resource');
    const longTaskEntries = performance.getEntriesByType('longtask');

    return {
      title: document.title,
      navigationTiming: navigationEntry ? pickNavigationTiming(navigationEntry) : null,
      paintTimings: paintEntries.map((entry) => ({
        name: entry.name,
        startTimeMs: round(entry.startTime),
        durationMs: round(entry.duration),
      })),
      resources: summarizeResources(resourceEntries),
      longTasks: longTaskEntries
        .map((entry) => ({
          name: entry.name,
          startTimeMs: round(entry.startTime),
          durationMs: round(entry.duration),
          attribution:
            'attribution' in entry && Array.isArray(entry.attribution)
              ? entry.attribution.map((item) => ({
                  name: item.name,
                  entryType: item.entryType,
                  containerType: item.containerType,
                  containerName: item.containerName,
                  containerId: item.containerId,
                  containerSrc: item.containerSrc,
                }))
              : [],
        }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10),
    };

    function pickNavigationTiming(entry) {
      return {
        type: entry.type,
        startTimeMs: round(entry.startTime),
        durationMs: round(entry.duration),
        redirectStartMs: round(entry.redirectStart),
        redirectEndMs: round(entry.redirectEnd),
        fetchStartMs: round(entry.fetchStart),
        domainLookupStartMs: round(entry.domainLookupStart),
        domainLookupEndMs: round(entry.domainLookupEnd),
        connectStartMs: round(entry.connectStart),
        connectEndMs: round(entry.connectEnd),
        requestStartMs: round(entry.requestStart),
        responseStartMs: round(entry.responseStart),
        responseEndMs: round(entry.responseEnd),
        domInteractiveMs: round(entry.domInteractive),
        domContentLoadedEventStartMs: round(entry.domContentLoadedEventStart),
        domContentLoadedEventEndMs: round(entry.domContentLoadedEventEnd),
        loadEventStartMs: round(entry.loadEventStart),
        loadEventEndMs: round(entry.loadEventEnd),
        transferSizeBytes: entry.transferSize,
        encodedBodySizeBytes: entry.encodedBodySize,
        decodedBodySizeBytes: entry.decodedBodySize,
      };
    }

    function summarizeResources(entries) {
      const byInitiatorType = {};
      let totalTransferSizeBytes = 0;
      let totalEncodedBodySizeBytes = 0;
      let totalDecodedBodySizeBytes = 0;

      for (const entry of entries) {
        const type = entry.initiatorType || 'other';
        byInitiatorType[type] = (byInitiatorType[type] ?? 0) + 1;
        totalTransferSizeBytes += entry.transferSize ?? 0;
        totalEncodedBodySizeBytes += entry.encodedBodySize ?? 0;
        totalDecodedBodySizeBytes += entry.decodedBodySize ?? 0;
      }

      return {
        count: entries.length,
        byInitiatorType,
        totalTransferSizeBytes,
        totalEncodedBodySizeBytes,
        totalDecodedBodySizeBytes,
      };
    }

    function round(value) {
      return Math.round(value * 100) / 100;
    }
  });
}

function parseTrace(traceText) {
  try {
    return JSON.parse(traceText);
  } catch {
    return null;
  }
}

function summarizeLongTasks(pageLongTasks, trace) {
  const traceTasks = collectTraceTasks(trace);
  const topLongTasks = [...pageLongTasks, ...traceTasks]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  return {
    pageLongTaskCount: pageLongTasks.length,
    traceTaskCountOver50ms: traceTasks.length,
    top: topLongTasks,
  };
}

function collectTraceTasks(trace) {
  const events = Array.isArray(trace?.traceEvents) ? trace.traceEvents : [];

  return events
    .filter((event) => {
      const durationMs = event.dur ? event.dur / 1000 : 0;
      return event.ph === 'X' && event.name === 'RunTask' && durationMs >= 50;
    })
    .map((event) => ({
      source: 'trace',
      name: event.name,
      startTimeMs: Math.round((event.ts / 1000) * 100) / 100,
      durationMs: Math.round((event.dur / 1000) * 100) / 100,
      processId: event.pid,
      threadId: event.tid,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);
}

function waitForTracingComplete(client) {
  return new Promise((resolve) => {
    client.once('Tracing.tracingComplete', resolve);
  });
}

async function readProtocolStream(client, handle) {
  const chunks = [];

  try {
    while (true) {
      const { data = '', eof, base64Encoded } = await client.send('IO.read', { handle });
      chunks.push(base64Encoded ? Buffer.from(data, 'base64').toString('utf8') : data);

      if (eof) break;
    }
  } finally {
    await client.send('IO.close', { handle }).catch(() => {});
  }

  return chunks.join('');
}
