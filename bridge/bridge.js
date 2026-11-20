'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openSocks, validateConfig } = require('./socks');
const { getPublicIp } = require('./public-ip');

const HOST = '127.0.0.1';
const PROXY_PORT = 18080;
const CONTROL_PORT = 18081;
const MAX_BODY_BYTES = 4096;

function validPort(number) {
  return Number.isInteger(number) && number >= 1 && number <= 65535;
}

// Both ports persist on disk and can be edited between bridge runs.
function loadBridgeSettings() {
  const directory = path.join(__dirname, '.local');
  const filename = path.join(directory, 'bridge-settings.json');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, JSON.stringify({ proxyPort: PROXY_PORT, controlPort: CONTROL_PORT }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!validPort(value.proxyPort) || !validPort(value.controlPort) || value.proxyPort === value.controlPort) {
    throw new Error('Port di bridge/.local/bridge-settings.json tidak valid atau sama.');
  }
  return { proxyPort: value.proxyPort, controlPort: value.controlPort };
}

function loadToken() {
  const directory = path.join(__dirname, '.local');
  const file = path.join(directory, 'pairing-token');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(24).toString('hex') + '\n', {
    mode: 0o600, flag: 'wx'
  });
  const key = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{48}$/.test(key)) throw new Error('Pairing key invalid. Check bridge/.local/pairing-token.');
  return key;
}

function json(res, status, object) {
  if (res.headersSent) return;
  const value = JSON.stringify(object);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(value),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(value);
}

function createBridge({ token, proxyPort = PROXY_PORT, controlPort = CONTROL_PORT, ipLookup = getPublicIp } = {}) {
  if (!token) throw new Error('Pairing key wajib tersedia.');
  let config = null;

  const control = http.createServer(async (req, res) => {
    const actualPort = control.address()?.port || controlPort;
    if (req.headers.host !== HOST + ':' + actualPort) {
      return json(res, 403, { ok: false, error: 'Invalid Host header.' });
    }
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      return json(res, 403, { ok: false, error: 'Origin tidak diizinkan.' });
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, configured: Boolean(config), proxyPort: proxy.address()?.port || proxyPort, controlPort: actualPort, version: '1.1.0' });
    }
    if (req.method !== 'POST' || !['/configure', '/disconnect', '/test', '/ip'].includes(req.url)) {
      return json(res, 404, { ok: false, error: 'Endpoint tidak tersedia.' });
    }
    const provided = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const a = Buffer.from(provided);
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return json(res, 401, { ok: false, error: 'Pairing key salah.' });
    }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      return json(res, 415, { ok: false, error: 'Gunakan application/json.' });
    }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('Data konfigurasi terlalu besar.');
      }
      const input = JSON.parse(body || '{}');
      if (req.url === '/disconnect') {
        config = null;
        return json(res, 200, { ok: true });
      }
      if (req.url === '/configure') {
        const next = validateConfig(input);
        // Fail closed: authenticate with the upstream server before activation.
        const socket = await openSocks(next, null, null, true);
        socket.destroy();
        config = next; // never write upstream credentials to disk
        return json(res, 200, { ok: true });
      }
      if (!config) return json(res, 409, { ok: false, error: 'SOCKS5 belum dikonfigurasi.' });
      if (req.url === '/ip') {
        const ip = await ipLookup(config);
        return json(res, 200, { ok: true, ip, source: 'api.ipify.org', viaProxy: true });
      }
      const link = await openSocks(config, 'example.com', 443);
      link.socket.destroy();
      return json(res, 200, { ok: true, message: 'SOCKS5 CONNECT berhasil.' });
    } catch (error) {
      return json(res, 400, { ok: false, error: error.message });
    }
  });
  control.headersTimeout = 12000;
  control.requestTimeout = 12000;

  const proxy = http.createServer(async (req, res) => {
    if (!config) return json(res, 503, { ok: false, error: 'SOCKS5 belum dikonfigurasi.' });
    let url;
    try {
      url = new URL(req.url);
      if (url.protocol !== 'http:' || !url.hostname || url.username || url.password) {
        throw new Error('Invalid proxy HTTP target.');
      }
    } catch (_) {
      return json(res, 400, { ok: false, error: 'Target HTTP tidak valid.' });
    }
    const destination = url.hostname.replace(/^\[|\]$/g, '');
    const port = Number(url.port || 80);
    let link;
    try {
      link = await openSocks(config, destination, port);
      if (link.earlyData.length) link.socket.unshift(link.earlyData);
      const headers = { ...req.headers };
      const connectionTokens = String(headers.connection || '').split(',').map(x => x.trim().toLowerCase());
      for (const name of ['proxy-connection', 'proxy-authorization', 'connection', 'keep-alive', 'upgrade', ...connectionTokens]) {
        delete headers[name];
      }
      headers.host = url.host;
      headers.connection = 'close';
      const agent = new http.Agent({ keepAlive: false });
      agent.createConnection = () => link.socket;
      const upstream = http.request({
        method: req.method,
        host: destination,
        port,
        path: url.pathname + url.search,
        headers,
        agent
      }, upstreamRes => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.statusMessage, upstreamRes.headers);
        upstreamRes.pipe(res);
      });
      upstream.on('error', error => {
        if (!res.headersSent) json(res, 502, { ok: false, error: 'Koneksi HTTP gagal: ' + error.message });
        else res.destroy();
      });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch (error) {
      link?.socket.destroy();
      if (!res.headersSent) json(res, 502, { ok: false, error: error.message });
    }
  });

  proxy.on('connect', async (req, browser, head) => {
    if (!config) {
      browser.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    let destination, port;
    try {
      const match = /^((?:\[[0-9a-fA-F:.]+\])|(?:[^: /?#]+)):(\d{1,5})$/.exec(req.url);
      if (!match) throw new Error('Invalid CONNECT target');
      destination = match[1].replace(/^\[|\]$/g, '');
      port = Number(match[2]);
      if (port < 1 || port > 65535) throw new Error('Invalid CONNECT port');
    } catch (_) {
      browser.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    try {
      const link = await openSocks(config, destination, port);
      if (browser.destroyed) { link.socket.destroy(); return; }
      browser.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (link.earlyData.length) browser.write(link.earlyData);
      if (head.length) link.socket.write(head);
      browser.pipe(link.socket);
      link.socket.pipe(browser);
      browser.on('error', () => link.socket.destroy());
      link.socket.on('error', () => browser.destroy());
      browser.on('close', () => link.socket.destroy());
      link.socket.on('close', () => browser.destroy());
    } catch (_) {
      if (!browser.destroyed) browser.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    }
  });
  proxy.headersTimeout = 15000;
  proxy.requestTimeout = 0;

  async function start() {
    await Promise.all([
      new Promise((resolve, reject) => {
        control.once('error', reject);
        control.listen(controlPort, HOST, resolve);
      }),
      new Promise((resolve, reject) => {
        proxy.once('error', reject);
        proxy.listen(proxyPort, HOST, resolve);
      })
    ]);
    return { controlPort: control.address().port, proxyPort: proxy.address().port };
  }

  async function stop() {
    config = null;
    await Promise.all([control, proxy].map(server =>
      new Promise(resolve => server.close(() => resolve()))
    ));
  }
  return { start, stop, control, proxy };
}

if (require.main === module) {
  try {
    const ports = loadBridgeSettings();
    const bridge = createBridge({ token: loadToken(), ...ports });
    bridge.start().then(() => {
      const token = loadToken();
      console.log('\n===========================================');
      console.log(' SOCKPILOT · LOCAL BRIDGE 1.1.0');
      console.log('===========================================');
      console.log(' HTTP proxy:  http://127.0.0.1:' + ports.proxyPort);
      console.log(' Control API: http://127.0.0.1:' + ports.controlPort);
      console.log(' Port settings: bridge/.local/bridge-settings.json');
      console.log(' Pairing key (copy into the extension):');
      console.log(' ' + token);
      console.log('\n Keep this window open. Never share the pairing key.');
      console.log(' Press Ctrl+C to stop.\n');
    }).catch(error => { console.error('Failed to start bridge:', error.message); process.exitCode = 1; });
  } catch (error) {
    console.error('Bridge error:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { createBridge, loadToken, loadBridgeSettings };
