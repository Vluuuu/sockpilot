'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProxyLine } = require('../extension/quick-import');

test('imports SOCKS5 host:port:username:password', () => {
  assert.deepEqual(parseProxyLine('proxy.example.com:1080:demo-user:demo-pass'), {
    host: 'proxy.example.com',
    port: 1080,
    username: 'demo-user',
    password: 'demo-pass'
  });
});

test('allows colons in passwords without truncating the value', () => {
  const parsed = parseProxyLine('proxy.example:443:user:pa:ss:word');
  assert.equal(parsed.password, 'pa:ss:word');
});

test('supports bracketed IPv6 hosts', () => {
  const parsed = parseProxyLine('[2001:db8::1]:1080:user:secret');
  assert.equal(parsed.host, '2001:db8::1');
  assert.equal(parsed.port, 1080);
});

test('rejects malformed inputs, ports, empty values, and multi-line secrets', () => {
  for (const invalid of [
    '', 'proxy.example:1080:user', 'proxy.example:0:user:pass',
    'proxy.example:65536:user:pass', 'http://proxy.example:1080:user:pass',
    'proxy.example:abc:user:pass', ':1080:user:pass',
    'proxy.example:1080::pass', 'proxy.example:1080:user:',
    'proxy.example:1080:user:pass\nnext', '[::1:1080:u:p',
    'proxy.example:1080:user:' + 'x'.repeat(256)
  ]) {
    assert.throws(() => parseProxyLine(invalid), invalid.slice(0, 40));
  }
});
