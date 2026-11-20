'use strict';

const https = require('node:https');
const tls = require('node:tls');
const net = require('node:net');
const { openSocks } = require('./socks');

const IP_SERVICE = 'api.ipify.org';

/**
 * Resolve the public IP *through the configured upstream SOCKS5 proxy*.
 * There is deliberately no direct-network fallback: failure returns an error.
 * HTTPS validates api.ipify.org's certificate, and Node parses HTTP framing.
 */
async function getPublicIp(config, { dial = openSocks, hostname = IP_SERVICE, port = 443, ca } = {}) {
  const link = await dial(config, hostname, port);
  const connection = tls.connect({
    socket: link.socket,
    servername: hostname,
    rejectUnauthorized: true,
    ...(ca ? { ca } : {})
  });
  const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
  agent.createConnection = () => connection;

  return new Promise((resolve, reject) => {
    let completed = false;
    const complete = (error, ip) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      agent.destroy();
      connection.destroy();
      if (error) reject(error);
      else resolve(ip);
    };
    const timer = setTimeout(() => complete(new Error('Pemeriksaan IP timeout (12 detik).')), 12000);
    const request = https.get({
      hostname,
      port,
      path: '/',
      method: 'GET',
      agent,
      headers: { Accept: 'text/plain', Connection: 'close', 'User-Agent': 'SockPilot/1.1' }
    }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        return complete(new Error('Layanan pemeriksa IP merespons HTTP ' + response.statusCode));
      }
      let value = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        value += chunk;
        if (value.length > 256) complete(new Error('Respons pemeriksaan IP terlalu panjang.'));
      });
      response.on('end', () => {
        const ip = value.trim();
        if (!net.isIP(ip)) return complete(new Error('Layanan pemeriksa IP tidak mengembalikan IP yang valid.'));
        complete(null, ip);
      });
      response.on('error', complete);
    });
    request.on('error', complete);
  });
}

module.exports = { getPublicIp };
