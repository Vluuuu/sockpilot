'use strict';

(function () {
  /**
   * Format: host:port:username:password
   * Password may contain colons. Bracket IPv6 hosts, e.g. [::1]:1080:u:p.
   * Import is intentionally explicit; do not log the raw string.
   */
  function parseProxyLine(line) {
    if (typeof line !== 'string') throw new Error('Masukkan proxy satu baris.');
    const text = line.trim();
    if (!text || /[\r\n\0]/.test(text)) throw new Error('Format harus satu baris: host:port:user:password.');
    let host, parts;
    if (text.startsWith('[')) {
      const end = text.indexOf(']');
      if (end < 2 || text[end + 1] !== ':') throw new Error('Alamat IPv6 harus memakai format [IPv6]:port:user:password.');
      host = text.slice(1, end);
      parts = text.slice(end + 2).split(':');
    } else {
      parts = text.split(':');
      host = parts.shift();
    }
    if (parts.length < 3) throw new Error('Format harus host:port:user:password.');
    const portText = parts.shift();
    const username = parts.shift();
    const password = parts.join(':');
    const port = Number(portText);
    if (!host || host.includes('://') || /[\s/?#@]/.test(host) ||
        !/^\d{1,5}$/.test(portText) || !Number.isInteger(port) ||
        port < 1 || port > 65535 || !username || !password) {
      throw new Error('Periksa Host, Port (1–65535), Username, dan Password.');
    }
    if (new TextEncoder().encode(username).length > 255 ||
        new TextEncoder().encode(password).length > 255) {
      throw new Error('Username/password maksimal 255 byte.');
    }
    return { host, port, username, password };
  }
  if (typeof module === 'object' && module.exports) module.exports = { parseProxyLine };
  else globalThis.sockPilotParseProxy = parseProxyLine;
})();
