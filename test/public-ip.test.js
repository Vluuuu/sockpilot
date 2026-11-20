'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getPublicIp } = require('../bridge/public-ip');

function hasOpenSSL() {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

test('public IP is fetched by validated HTTPS tunneled through SOCKS5 authentication', {
  skip: !hasOpenSSL() && 'OpenSSL CLI not available for ephemeral TLS test certificate'
}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sockpilot-ip-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const keyFile = path.join(dir, 'tls-key.pem');
  const certFile = path.join(dir, 'tls-cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyFile, '-out', certFile, '-days', '1',
    '-subj', '/CN=api.ipify.org',
    '-addext', 'subjectAltName=DNS:api.ipify.org'
  ], { stdio: 'ignore' });
  const certificate = fs.readFileSync(certFile);
  const fakeIpService = https.createServer({
    key: fs.readFileSync(keyFile),
    cert: certificate
  }, (req, res) => {
    assert.equal(req.url, '/');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('203.0.113.9\n');
  });
  const servicePort = await listen(fakeIpService);
  t.after(async () => { await new Promise(resolve => fakeIpService.close(resolve)); });

  let sawAuthenticatedTunnel = false;
  const active = new Set();
  const socks = net.createServer(browser => {
    active.add(browser);
    browser.on('close', () => active.delete(browser));
    let stage = 0;
    let bytes = Buffer.alloc(0);
    browser.on('data', chunk => {
      if (stage === 3) return;
      bytes = Buffer.concat([bytes, chunk]);
      while (true) {
        if (stage === 0) {
          if (bytes.length < 3) return;
          assert.deepEqual([...bytes.subarray(0, 3)], [5, 1, 2]);
          bytes = bytes.subarray(3);
          browser.write(Buffer.from([5, 2]));
          stage = 1;
        } else if (stage === 1) {
          if (bytes.length < 2) return;
          const u = bytes[1];
          if (bytes.length < 3 + u) return;
          const p = bytes[2 + u];
          if (bytes.length < 3 + u + p) return;
          assert.equal(bytes.subarray(2, 2 + u).toString(), 'test-user');
          assert.equal(bytes.subarray(3 + u, 3 + u + p).toString(), 'test-password');
          bytes = bytes.subarray(3 + u + p);
          browser.write(Buffer.from([1, 0]));
          stage = 2;
        } else if (stage === 2) {
          if (bytes.length < 5) return;
          const addressType = bytes[3];
          assert.equal(addressType, 3, 'SOCKS must use remote destination DNS');
          const length = 4 + 1 + bytes[4] + 2;
          if (bytes.length < length) return;
          const host = bytes.subarray(5, 5 + bytes[4]).toString();
          const port = bytes.readUInt16BE(length - 2);
          assert.equal(host, 'api.ipify.org');
          assert.equal(port, servicePort);
          sawAuthenticatedTunnel = true;
          const rest = bytes.subarray(length);
          bytes = Buffer.alloc(0);
          stage = 3;
          const remote = net.createConnection({ host: '127.0.0.1', port: servicePort }, () => {
            browser.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            if (rest.length) remote.write(rest);
            browser.pipe(remote);
            remote.pipe(browser);
          });
          remote.on('error', () => browser.destroy());
          browser.on('close', () => remote.destroy());
          return;
        }
      }
    });
    browser.on('error', () => {});
  });
  const socksPort = await listen(socks);
  t.after(async () => {
    for (const socket of active) socket.destroy();
    await new Promise(resolve => socks.close(resolve));
  });
  const ip = await getPublicIp({
    host: '127.0.0.1', port: socksPort,
    username: 'test-user', password: 'test-password'
  }, {
    hostname: 'api.ipify.org',
    port: servicePort,
    ca: certificate
  });
  assert.equal(ip, '203.0.113.9');
  assert.equal(sawAuthenticatedTunnel, true);
});
