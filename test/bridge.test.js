'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const { createBridge } = require('../bridge/bridge');
const { validateConfig, targetBytes, ipv6Bytes } = require('../bridge/socks');

const KEY = 'a'.repeat(48);

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}
async function close(server) {
  await new Promise(resolve => server.close(resolve));
}

function mockSocks(username, password, destinationPort) {
  const destinations = [];
  const server = net.createServer(socket => {
    let stage = 0;
    let data = Buffer.alloc(0);
    let target = null;
    socket.on('data', chunk => {
      if (stage === 3) return;
      data = Buffer.concat([data, chunk]);
      while (true) {
        if (stage === 0) {
          if (data.length < 3) return;
          assert.deepEqual([...data.subarray(0, 3)], [5, 1, 2]);
          data = data.subarray(3);
          socket.write(Buffer.from([5, 2]));
          stage = 1;
        } else if (stage === 1) {
          if (data.length < 2) return;
          const userLength = data[1];
          if (data.length < 3 + userLength) return;
          const passLength = data[2 + userLength];
          const length = 3 + userLength + passLength;
          if (data.length < length) return;
          const user = data.subarray(2, 2 + userLength).toString();
          const pass = data.subarray(3 + userLength, length).toString();
          data = data.subarray(length);
          const valid = user === username && pass === password;
          socket.write(Buffer.from([1, valid ? 0 : 1]));
          if (!valid) { socket.end(); return; }
          stage = 2;
        } else if (stage === 2) {
          if (data.length < 5) return;
          const type = data[3];
          const length = type === 1 ? 4 : type === 4 ? 16 : type === 3 ? 1 + data[4] : -1;
          if (length < 0) throw new Error('Unexpected address type ' + type);
          const count = 4 + length + 2;
          if (data.length < count) return;
          const host = type === 3 ? data.subarray(5, 5 + data[4]).toString() : 'address-type-' + type;
          const port = data.readUInt16BE(count - 2);
          destinations.push({ host, port, type });
          const early = data.subarray(count);
          data = Buffer.alloc(0);
          stage = 3;
          target = net.createConnection({ host: '127.0.0.1', port: destinationPort }, () => {
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            if (early.length) target.write(early);
            socket.pipe(target);
            target.pipe(socket);
          });
          target.on('error', () => socket.destroy());
          socket.on('close', () => target.destroy());
          return;
        } else return;
      }
    });
    socket.on('error', () => {});
  });
  return { server, destinations };
}

test('validates credentials, ports and proxy targets', () => {
  const valid = validateConfig({ host: 'proxy.example', port: 1080, username: 'user', password: 'pass' });
  assert.equal(valid.port, 1080);
  assert.throws(() => validateConfig({ host: 'http://bad', port: 1080, username: 'user', password: 'pass' }));
  assert.throws(() => validateConfig({ host: 'proxy.example', port: 99999, username: 'user', password: 'pass' }));
  assert.throws(() => validateConfig({ host: 'proxy.example', port: 1080, username: 'user', password: '' }));
  assert.throws(() => validateConfig({ host: 'proxy.example', port: 1080, username: 'x'.repeat(256), password: 'pass' }));
  assert.throws(() => targetBytes('example.com', 65536));
});

test('sends destination hostname for SOCKS5 remote DNS', () => {
  const encoded = targetBytes('example.test', 443);
  assert.equal(encoded[0], 3);
  assert.equal(encoded.subarray(2, 2 + encoded[1]).toString(), 'example.test');
  assert.equal(encoded.readUInt16BE(encoded.length - 2), 443);
  assert.equal(ipv6Bytes('::1').length, 16);
});

test('control API pairing, SOCKS5 auth, HTTP, CONNECT and disconnect', async t => {
  const destination = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('upstream:' + req.method + ':' + req.url);
  });
  const destinationPort = await listen(destination);
  const upstream = mockSocks('demo-user', 'demo-pass', destinationPort);
  const socksPort = await listen(upstream.server);
  const bridge = createBridge({ token: KEY, proxyPort: 0, controlPort: 0, ipLookup: async () => '198.51.100.42' });
  const ports = await bridge.start();
  t.after(async () => {
    await bridge.stop();
    await close(upstream.server);
    await close(destination);
  });

  async function api(path, token, body = {}, extraHeaders = {}) {
    const response = await fetch('http://127.0.0.1:' + ports.controlPort + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        ...extraHeaders
      },
      body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }

  const settings = { host: '127.0.0.1', port: socksPort, username: 'demo-user', password: 'demo-pass' };
  const wrongKey = await api('/configure', 'wrong', settings);
  assert.equal(wrongKey.status, 401);
  const forbiddenOrigin = await api('/configure', KEY, settings, { Origin: 'https://untrusted.example' });
  assert.equal(forbiddenOrigin.status, 403);
  const badCredentials = await api('/configure', KEY, { ...settings, password: 'wrong' });
  assert.equal(badCredentials.status, 400);
  const ok = await api('/configure', KEY, settings);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));

  const health = await (await fetch('http://127.0.0.1:' + ports.controlPort + '/health')).json();
  assert.equal(health.configured, true);
  assert.equal(health.proxyPort, ports.proxyPort);
  assert.equal(health.controlPort, ports.controlPort);

  const deniedIp = await api('/ip', 'wrong');
  assert.equal(deniedIp.status, 401);
  const publicIp = await api('/ip', KEY);
  assert.equal(publicIp.status, 200);
  assert.equal(publicIp.data.ip, '198.51.100.42');
  assert.equal(publicIp.data.viaProxy, true);

  const responseBody = await new Promise((resolve, reject) => {
    http.get({
      host: '127.0.0.1',
      port: ports.proxyPort,
      path: 'http://example.test/demo?q=1'
    }, response => {
      let content = '';
      response.setEncoding('utf8');
      response.on('data', data => content += data);
      response.on('end', () => resolve(content));
    }).on('error', reject);
  });
  assert.equal(responseBody, 'upstream:GET:/demo?q=1');
  assert.equal(upstream.destinations[0].host, 'example.test');
  assert.equal(upstream.destinations[0].port, 80);

  const tunnel = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: ports.proxyPort }, () => {
      socket.write('CONNECT example.test:443 HTTP/1.1\r\nHost: example.test:443\r\n\r\n');
    });
    let content = '';
    let started = false;
    socket.on('data', part => {
      content += part.toString();
      if (!started && content.includes('200 Connection Established')) {
        started = true;
        socket.write('GET /tunneled HTTP/1.1\r\nHost: example.test\r\nConnection: close\r\n\r\n');
      }
    });
    socket.on('end', () => resolve(content));
    socket.on('error', reject);
  });
  assert.match(tunnel, /upstream:GET:\/tunneled/);
  assert.equal(upstream.destinations[1].host, 'example.test');
  assert.equal(upstream.destinations[1].port, 443);

  const disconnect = await api('/disconnect', KEY);
  assert.equal(disconnect.status, 200);
  const after = await (await fetch('http://127.0.0.1:' + ports.controlPort + '/health')).json();
  assert.equal(after.configured, false);
  const ipAfterDisconnect = await api('/ip', KEY);
  assert.equal(ipAfterDisconnect.status, 409);
});
