'use strict';

const net = require('node:net');
const { domainToASCII } = require('node:url');

function validateConfig(value) {
  if (!value || typeof value !== 'object') throw new Error('Konfigurasi SOCKS5 tidak valid.');
  const host = String(value.host || '').trim().replace(/^\[|\]$/g, '');
  const port = Number(value.port);
  const { username, password } = value;
  if (!host || host.length > 253 || /[\s/?#@]/.test(host) || host.includes('://')) {
    throw new Error('Host SOCKS5 tidak valid. Masukkan hostname atau IP tanpa skema.');
  }
  if (!net.isIP(host) && !domainToASCII(host)) throw new Error('Hostname SOCKS5 tidak valid.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port harus 1–65535.');
  if (typeof username !== 'string' || typeof password !== 'string') throw new Error('Username dan password harus berupa teks.');
  for (const credential of [username, password]) {
    const size = Buffer.byteLength(credential, 'utf8');
    if (size < 1 || size > 255) throw new Error('Username dan password harus 1–255 byte UTF-8.');
  }
  return { host, port, username, password };
}

function ipv6Bytes(ip) {
  let input = ip.toLowerCase().split('%')[0];
  if (input.includes('.')) {
    const pos = input.lastIndexOf(':');
    const numbers = input.slice(pos + 1).split('.').map(Number);
    if (numbers.length !== 4 || numbers.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
      throw new Error('Alamat IPv6 tidak valid.');
    }
    input = input.slice(0, pos + 1) + ((numbers[0] << 8) | numbers[1]).toString(16) +
      ':' + ((numbers[2] << 8) | numbers[3]).toString(16);
  }
  const segments = input.split('::');
  if (segments.length > 2) throw new Error('Alamat IPv6 tidak valid.');
  const left = segments[0] ? segments[0].split(':') : [];
  const right = segments[1] ? segments[1].split(':') : [];
  const padding = 8 - left.length - right.length;
  if (padding < 0 || (segments.length === 1 && padding !== 0)) throw new Error('Alamat IPv6 tidak valid.');
  const groups = [...left, ...Array(padding).fill('0'), ...right];
  const output = Buffer.alloc(16);
  if (groups.length !== 8 || groups.some(x => !/^[0-9a-f]{1,4}$/.test(x))) {
    throw new Error('Alamat IPv6 tidak valid.');
  }
  groups.forEach((group, i) => output.writeUInt16BE(parseInt(group, 16), 2 * i));
  return output;
}

function targetBytes(host, port) {
  const hostname = host.replace(/^\[|\]$/g, '');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port tujuan tidak valid.');
  const type = net.isIP(hostname);
  let bytes;
  if (type === 4) bytes = Buffer.from(hostname.split('.').map(Number));
  else if (type === 6) bytes = ipv6Bytes(hostname);
  else {
    const ascii = domainToASCII(hostname);
    if (!ascii || Buffer.byteLength(ascii) > 255) throw new Error('Hostname tujuan tidak valid.');
    const hostBytes = Buffer.from(ascii);
    bytes = Buffer.concat([Buffer.from([hostBytes.length]), hostBytes]);
  }
  const portBytes = Buffer.alloc(2);
  portBytes.writeUInt16BE(port);
  return Buffer.concat([Buffer.from([type === 4 ? 1 : type === 6 ? 4 : 3]), bytes, portBytes]);
}

class Reader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.error = null;
    this.onData = data => {
      this.buffer = Buffer.concat([this.buffer, data]);
      if (this.buffer.length > 65536) this.onError(new Error('Balasan SOCKS5 terlalu besar.'));
      this.flush();
    };
    this.onError = error => { this.error = error; this.flush(); };
    this.onClose = () => this.onError(new Error('Server SOCKS5 menutup koneksi.'));
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }
  flush() {
    if (!this.pending) return;
    const { count, resolve, reject } = this.pending;
    if (this.buffer.length >= count) {
      const value = this.buffer.subarray(0, count);
      this.buffer = this.buffer.subarray(count);
      this.pending = null;
      resolve(value);
    } else if (this.error) {
      this.pending = null;
      reject(this.error);
    }
  }
  read(count) {
    if (this.pending) return Promise.reject(new Error('SOCKS5 reader sedang digunakan.'));
    if (this.buffer.length >= count) {
      const value = this.buffer.subarray(0, count);
      this.buffer = this.buffer.subarray(count);
      return Promise.resolve(value);
    }
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => { this.pending = { count, resolve, reject }; });
  }
  release() {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
    const remaining = this.buffer;
    this.buffer = Buffer.alloc(0);
    return remaining;
  }
}

async function openSocks(config, destination, port, authOnly = false) {
  const socket = net.createConnection({ host: config.host, port: config.port });
  const timer = setTimeout(() => socket.destroy(new Error('SOCKS5 timeout (8 detik).')), 8000);
  let reader;
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
      socket.once('close', () => reject(new Error('Tidak bisa terhubung ke server SOCKS5.')));
    });
    reader = new Reader(socket);
    socket.write(Buffer.from([5, 1, 2]));
    const method = await reader.read(2);
    if (method[0] !== 5 || method[1] !== 2) throw new Error('Server tidak mendukung autentikasi SOCKS5 username/password.');
    const user = Buffer.from(config.username, 'utf8');
    const pass = Buffer.from(config.password, 'utf8');
    socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]));
    const result = await reader.read(2);
    if (result[0] !== 1 || result[1] !== 0) throw new Error('Username/password SOCKS5 ditolak.');
    if (authOnly) {
      reader.release();
      return socket;
    }
    socket.write(Buffer.concat([Buffer.from([5, 1, 0]), targetBytes(destination, port)]));
    const answer = await reader.read(4);
    if (answer[0] !== 5 || answer[1] !== 0) throw new Error('SOCKS5 CONNECT gagal (kode ' + answer[1] + ').');
    if (answer[3] === 1) await reader.read(6);
    else if (answer[3] === 4) await reader.read(18);
    else if (answer[3] === 3) { const n = (await reader.read(1))[0]; await reader.read(n + 2); }
    else throw new Error('Tipe balasan SOCKS5 tidak dikenali.');
    const earlyData = reader.release();
    return { socket, earlyData };
  } catch (error) {
    reader?.release();
    socket.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { validateConfig, openSocks, targetBytes, ipv6Bytes };
