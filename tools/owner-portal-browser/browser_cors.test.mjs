import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium } from 'playwright-core';

const HOST = '127.0.0.1';
const APP_PORT = 8764;
const API_PORT = 8765;
const APP_ORIGIN = `http://${HOST}:${APP_PORT}`;
const API_PATH = '/api/mobile/sanitation/establishment-status/';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_SCRIPT = path.join(HERE, 'fixture_server.py');
const FIXTURE = JSON.parse(readFileSync(path.join(HERE, 'fixtures.json'), 'utf8'));
const CHROME = process.env.OWNER_BROWSER_CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FAULT = process.env.OWNER_CORS_FAULT || '';

assert.ok(FAULT === '' || FAULT === 'strip-allow-origin', 'Unknown OWNER_CORS_FAULT');
assert.ok(existsSync(CHROME), `Installed Chrome is required: ${CHROME}`);
assert.equal(FIXTURE.code, 'MBN-2222-2222');
assert.equal(Object.keys(FIXTURE.response).length, 14);

function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds} ms`)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function waitUntil(predicate, milliseconds, label) {
  const deadline = Date.now() + milliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`${label} timed out after ${milliseconds} ms`);
    await delay(25);
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

function closeServer(server) {
  return withTimeout(new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }), 3000, 'app server shutdown');
}

async function selectApiPort() {
  const probe = net.createServer();
  try {
    await listen(probe, API_PORT);
    return API_PORT;
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    const alternate = net.createServer();
    await listen(alternate, 0);
    const selected = alternate.address().port;
    await closeServer(alternate);
    process.stdout.write(`API port ${API_PORT} occupied; explicitly selected ${selected}\n`);
    return selected;
  } finally {
    if (probe.listening) await closeServer(probe);
  }
}

async function startAppServer() {
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/') {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    }).end('<!doctype html><title>Owner CORS regression</title><h1>Owner CORS regression</h1>');
  });
  try {
    await withTimeout(listen(server, APP_PORT), 3000, 'app origin binding');
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`${APP_ORIGIN} is occupied; the fixture requires this exact app origin`);
    }
    throw error;
  }
  return server;
}

function pythonExecutable() {
  if (process.env.OWNER_BROWSER_PYTHON) return process.env.OWNER_BROWSER_PYTHON;
  return execFileSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], {
    encoding: 'utf8', timeout: 3000,
  }).trim();
}

// RED proof only: remove the allow-origin header in this child process's memory.
// The committed fixture and its files remain untouched.
const FAULT_PYTHON = [
  'import importlib.util, sys',
  'source = sys.argv[1]',
  'spec = importlib.util.spec_from_file_location("owner_fixture_fault", source)',
  'module = importlib.util.module_from_spec(spec)',
  'spec.loader.exec_module(module)',
  'original = module.FixtureHandler.send_header',
  'def send_header(self, name, value):',
  '    if name.lower() != "access-control-allow-origin":',
  '        original(self, name, value)',
  'module.FixtureHandler.send_header = send_header',
  'sys.argv = [source, *sys.argv[2:]]',
  'module.main()',
].join('\n');

async function startFixture(mode, port, fault = false) {
  const args = fault
    ? ['-B', '-u', '-c', FAULT_PYTHON, FIXTURE_SCRIPT, '--mode', mode, '--port', String(port)]
    : ['-B', '-u', FIXTURE_SCRIPT, '--mode', mode, '--port', String(port)];
  const child = spawn(pythonExecutable(), args, {
    cwd: HERE,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = [];
  const records = [];
  let stdout = '';
  let stderr = '';
  child.on('error', (error) => { stderr += error.message; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    for (;;) {
      const newline = stdout.indexOf('\n');
      if (newline < 0) break;
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      lines.push(line);
      const match = /^(allowed|denied) (OPTIONS|POST) count=(\d+)$/.exec(line);
      if (match) records.push({ mode: match[1], method: match[2], count: Number(match[3]) });
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  try {
    await waitUntil(
      () => lines.some((line) => line.includes(`listening on ${HOST}:${port} (${mode})`)) ||
        child.exitCode !== null,
      5000,
      'fixture startup',
    );
    assert.ok(child.exitCode === null, `Fixture exited: ${stderr || lines.join(' | ')}`);
    assert.ok(lines.some((line) => line.includes(`listening on ${HOST}:${port} (${mode})`)));
    return { child, records };
  } catch (error) {
    await stopFixture(child);
    throw error;
  }
}

async function stopFixture(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  try {
    await withTimeout(exited, 3000, 'fixture shutdown');
  } catch (error) {
    child.kill('SIGKILL');
    await withTimeout(exited, 2000, 'forced fixture shutdown');
    throw error;
  }
}

async function fetchFromPage(page, endpoint) {
  return withTimeout(page.evaluate(async ({ url, code }) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
      return { ok: true, status: response.status, body: await response.json() };
    } catch (error) {
      return { ok: false, name: error.name };
    }
  }, { url: endpoint, code: FIXTURE.code }), 10000, 'browser Fetch');
}

async function runScenario(mode, verify) {
  let app;
  let fixture;
  let browser;
  let context;
  let primaryError;
  try {
    app = await startAppServer();
    const apiPort = await selectApiPort();
    fixture = await startFixture(mode, apiPort, mode === 'allowed' && FAULT !== '');
    browser = await withTimeout(chromium.launch({
      executablePath: CHROME,
      headless: true,
      timeout: 10000,
    }), 12000, 'Chrome startup');
    context = await browser.newContext({ serviceWorkers: 'block' });
    context.setDefaultTimeout(10000);
    const page = await context.newPage();
    const endpoint = `http://${HOST}:${apiPort}${API_PATH}`;
    const posts = [];
    const responses = [];
    page.on('request', (request) => {
      if (request.url() === endpoint && request.method() === 'POST') posts.push(request);
    });
    page.on('response', (response) => {
      if (response.url() === endpoint && response.request().method() === 'POST') {
        responses.push(response);
      }
    });
    await page.goto(APP_ORIGIN, { waitUntil: 'load', timeout: 10000 });
    await context.addCookies([{
      name: 'proof_cookie', value: 'would_be_sent_without_omit', url: APP_ORIGIN,
      sameSite: 'Lax',
    }]);
    assert.match(await page.evaluate(() => document.cookie), /proof_cookie=/);
    const result = await fetchFromPage(page, endpoint);
    await waitUntil(() => fixture.records.length >= (mode === 'allowed' && FAULT === '' ? 2 : 1),
      2000, 'fixture request records');
    await verify({ result, posts, responses, records: fixture.records });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    for (const cleanup of [
      () => context && withTimeout(context.close(), 5000, 'browser context shutdown'),
      () => browser && withTimeout(browser.close(), 5000, 'Chrome shutdown'),
      () => fixture && stopFixture(fixture.child),
      () => app && closeServer(app),
    ]) {
      try { await cleanup(); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length && !primaryError) throw cleanupErrors[0];
  }
}

test('allowed preflight sends exactly one credential-free POST and valid response',
  { timeout: 45000, concurrency: false }, async () => {
    await runScenario('allowed', async ({ result, posts, responses, records }) => {
      assert.deepEqual(records, [
        { mode: 'allowed', method: 'OPTIONS', count: 1 },
        { mode: 'allowed', method: 'POST', count: 1 },
      ]);
      assert.equal(result.ok, true, 'browser must read the cross-origin response');
      assert.equal(result.status, 200);
      assert.equal(Object.keys(result.body).length, 14);
      assert.deepEqual(result.body, FIXTURE.response);
      assert.equal(posts.length, 1);
      assert.deepEqual(posts[0].postDataJSON(), { code: FIXTURE.code });
      const sentHeaders = await posts[0].allHeaders();
      assert.equal(sentHeaders.cookie, undefined);
      assert.equal(sentHeaders.authorization, undefined);
      assert.equal(sentHeaders.origin, APP_ORIGIN);
      assert.equal(responses.length, 1);
      const receivedHeaders = await responses[0].allHeaders();
      assert.equal(receivedHeaders['access-control-allow-origin'], APP_ORIGIN);
      assert.equal(receivedHeaders['access-control-allow-credentials'], undefined);
      assert.equal(receivedHeaders.vary, 'Origin');
      assert.equal(receivedHeaders['cache-control'], 'no-store');
      process.stdout.write('Chrome allowed: OPTIONS=1 POST=1, 200, 14 keys, Cookie absent, Authorization absent\n');
    });
  });

test('denied preflight rejects Fetch without sending a POST',
  { timeout: 45000, concurrency: false }, async () => {
    await runScenario('denied', async ({ result, responses, records }) => {
      assert.deepEqual(records, [{ mode: 'denied', method: 'OPTIONS', count: 1 }]);
      assert.deepEqual(result, { ok: false, name: 'TypeError' });
      assert.equal(responses.length, 0);
      process.stdout.write('Chrome denied: OPTIONS=1 POST=0, Fetch rejected\n');
    });
  });
