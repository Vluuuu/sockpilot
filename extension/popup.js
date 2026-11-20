'use strict';

const DEFAULT_CONTROL_PORT = 18081;
const DEFAULT_PROXY_PORT = 18080;
const $ = id => document.getElementById(id);

function getPorts() {
  const controlPort = Number($('bridge-control-port').value);
  const proxyPort = Number($('bridge-proxy-port').value);
  if (![controlPort, proxyPort].every(port => Number.isInteger(port) && port > 0 && port <= 65535) ||
      controlPort === proxyPort) {
    throw new Error('Port bridge harus berbeda dan berada antara 1–65535.');
  }
  return { controlPort, proxyPort };
}

async function api(path, token, body) {
  const { controlPort } = getPorts();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path === '/ip' ? 23000 : 9500);
  try {
    const response = await fetch('http://127.0.0.1:' + controlPort + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'HTTP ' + response.status);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function action(type, data = {}) {
  const response = await chrome.runtime.sendMessage({ action: type, ...data });
  if (!response?.ok) throw new Error(response?.error || 'Extension tidak merespons.');
  return response.data;
}

function notice(message, good = false) {
  const el = $('notice');
  el.hidden = !message;
  el.textContent = message || '';
  el.classList.toggle('good', good);
}

function status(title, description, type = '') {
  $('status-title').textContent = title;
  $('status-detail').textContent = description;
  $('status-dot').className = 'status-dot ' + type;
}

function setIp(ip, message = '') {
  $('public-ip').textContent = ip || 'Belum dicek';
  $('ip-note').textContent = message || 'IP publik melalui SOCKS5';
}

function busy(value) {
  for (const name of ['connect', 'disconnect', 'refresh', 'test', 'check-ip', 'parse-quick']) {
    $(name).disabled = value;
  }
}

async function refresh() {
  try {
    const state = await action('state');
    let health;
    try { health = await api('/health'); } catch (_) { health = null; }
    if (health && health.proxyPort !== getPorts().proxyPort) {
      status('Pengaturan port tidak cocok', 'Port HTTP bridge: ' + health.proxyPort, 'error');
    } else if (state.enabled && health?.configured) {
      status('Proxy aktif di Brave', 'SOCKS5 via bridge · 127.0.0.1:' + health.proxyPort, 'on');
    } else if (state.enabled) {
      status('Brave aktif, bridge belum siap', 'Jalankan bridge, lalu Hubungkan proxy', 'error');
    } else if (!health) {
      status('Bridge belum berjalan', 'Periksa bridge/start-bridge.cmd dan port kontrol', 'error');
    } else {
      status('Proxy nonaktif', 'Bridge lokal siap · koneksi langsung');
    }
    if (state.levelOfControl === 'not_controllable') {
      notice('Pengaturan proxy dikunci oleh kebijakan browser.');
    }
  } catch (error) {
    status('Tidak bisa membaca status', error.message, 'error');
  }
}

async function saveFields() {
  const { controlPort, proxyPort } = getPorts();
  await chrome.storage.local.set({
    host: $('host').value.trim(),
    port: Number($('port').value) || 1080,
    username: $('username').value,
    token: $('token').value.trim(),
    bridgeControlPort: controlPort,
    bridgeProxyPort: proxyPort,
    remember: $('remember').checked
  });
  if ($('remember').checked) await chrome.storage.local.set({ password: $('password').value });
  else await chrome.storage.local.remove('password');
}

async function load() {
  const saved = await chrome.storage.local.get([
    'host', 'port', 'username', 'password', 'remember',
    'token', 'bridgeControlPort', 'bridgeProxyPort'
  ]);
  $('host').value = saved.host || '';
  $('port').value = saved.port || '1080';
  $('username').value = saved.username || '';
  $('remember').checked = Boolean(saved.remember);
  $('password').value = saved.remember ? saved.password || '' : '';
  $('token').value = saved.token || '';
  $('bridge-control-port').value = saved.bridgeControlPort || DEFAULT_CONTROL_PORT;
  $('bridge-proxy-port').value = saved.bridgeProxyPort || DEFAULT_PROXY_PORT;
  if (!saved.token) $('token').closest('details').open = true;
  await refresh();
}

// Save ordinary configuration and pairing key locally on field change.
// Password is only saved when the user deliberately checks Remember password.
for (const id of ['host', 'port', 'username', 'token', 'bridge-control-port', 'bridge-proxy-port', 'remember', 'password']) {
  $(id).addEventListener('change', async () => {
    try {
      await saveFields();
      if (id.startsWith('bridge-')) {
        setIp(null);
        await refresh();
      }
    } catch (error) {
      notice('Pengaturan belum tersimpan: ' + error.message);
    }
  });
}

$('parse-quick').addEventListener('click', () => {
  try {
    const parsed = sockPilotParseProxy($('quick-import').value);
    $('host').value = parsed.host;
    $('port').value = parsed.port;
    $('username').value = parsed.username;
    $('password').value = parsed.password;
    $('quick-import').value = '';
    setIp(null);
    notice('Format berhasil diimpor. Klik Hubungkan proxy.', true);
    // Persist host/port/username, but not the password unless Remember is enabled.
    saveFields().catch(error => notice(error.message));
  } catch (error) {
    notice(error.message);
  }
});

$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  notice('');
  const host = $('host').value.trim();
  const port = Number($('port').value);
  const username = $('username').value;
  const password = $('password').value;
  const token = $('token').value.trim();
  if (!host || host.includes('://') || /\s/.test(host) ||
      !Number.isInteger(port) || port < 1 || port > 65535) {
    return notice('Isi Host tanpa skema dan Port 1 sampai 65535.');
  }
  if (!username || !password) return notice('Username dan password wajib diisi.');
  if (!token) {
    $('token').closest('details').open = true;
    return notice('Masukkan pairing key dari terminal bridge.');
  }
  busy(true);
  try {
    const ports = getPorts();
    const health = await api('/health');
    if (health.proxyPort !== ports.proxyPort) {
      throw new Error('Port HTTP bridge tidak cocok. Sesuaikan dengan bridge/.local/bridge-settings.json.');
    }
    await api('/configure', token, { host, port, username, password });
    await action('connect', { proxyPort: ports.proxyPort });
    await saveFields();
    setIp(null);
    notice('Berhasil terhubung. Klik Cek IP untuk melihat IP publik proxy.', true);
    await refresh();
  } catch (error) {
    notice(error.name === 'AbortError' ? 'Bridge tidak merespons. Periksa terminal.' : error.message);
    await refresh();
  } finally {
    busy(false);
  }
});

$('disconnect').addEventListener('click', async () => {
  busy(true);
  notice('');
  try {
    await action('disconnect');
    const saved = await chrome.storage.local.get(['token']);
    const key = $('token').value.trim() || saved.token;
    if (key) {
      try { await api('/disconnect', key, {}); } catch (_) {}
    }
    setIp(null);
    notice('Proxy Brave dimatikan. Pengaturan Windows tidak berubah.', true);
    await refresh();
  } catch (error) {
    notice(error.message);
  } finally {
    busy(false);
  }
});

$('refresh').addEventListener('click', () => refresh());
$('test').addEventListener('click', async () => {
  busy(true);
  notice('');
  try {
    const key = $('token').value.trim();
    if (!key) throw new Error('Masukkan pairing key dan hubungkan proxy dahulu.');
    const result = await api('/test', key, {});
    notice(result.message || 'Uji koneksi berhasil.', true);
  } catch (error) {
    notice(error.name === 'AbortError' ? 'Koneksi timeout.' : error.message);
  } finally {
    busy(false);
  }
});

$('check-ip').addEventListener('click', async () => {
  busy(true);
  notice('');
  setIp('Mengecek…', 'Menghubungi api.ipify.org melalui SOCKS5');
  try {
    const key = $('token').value.trim();
    if (!key) throw new Error('Pairing key wajib diisi.');
    const state = await action('state');
    if (!state.enabled) throw new Error('Hubungkan proxy di Brave terlebih dahulu.');
    const result = await api('/ip', key, {});
    setIp(result.ip, 'IP keluar proxy · api.ipify.org (HTTPS)');
    notice('IP publik proxy: ' + result.ip, true);
  } catch (error) {
    setIp(null, 'Pemeriksaan IP gagal');
    notice(error.name === 'AbortError' ? 'Pemeriksaan IP timeout.' : error.message);
  } finally {
    busy(false);
  }
});

$('toggle-password').addEventListener('click', () => {
  const el = $('password');
  el.type = el.type === 'password' ? 'text' : 'password';
  $('toggle-password').textContent = el.type === 'password' ? 'Lihat' : 'Tutup';
});

load().catch(error => notice('Gagal memuat konfigurasi: ' + error.message));
