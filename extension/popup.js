'use strict';

const API = 'http://127.0.0.1:18081';
const $ = id => document.getElementById(id);

async function api(path, token, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(API + path, {
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

async function action(type) {
  const response = await chrome.runtime.sendMessage({ action: type });
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

function busy(value) {
  for (const name of ['connect', 'disconnect', 'refresh', 'test']) $(name).disabled = value;
}

async function refresh() {
  try {
    const state = await action('state');
    let health;
    try { health = await api('/health'); } catch (_) { health = null; }
    if (state.enabled && health?.configured) {
      status('Proxy aktif di Brave', 'SOCKS5 via bridge lokal · 127.0.0.1:18080', 'on');
    } else if (state.enabled) {
      status('Brave aktif, bridge belum siap', 'Jalankan bridge, lalu Hubungkan proxy', 'error');
    } else if (!health) {
      status('Bridge belum berjalan', 'Buka bridge/start-bridge.cmd dahulu', 'error');
    } else {
      status('Proxy nonaktif', 'Bridge siap · koneksi langsung');
    }
    if (state.levelOfControl === 'not_controllable') notice('Pengaturan proxy dikunci oleh kebijakan browser.');
  } catch (error) {
    status('Tidak bisa membaca status', error.message, 'error');
  }
}

async function load() {
  const saved = await chrome.storage.local.get(['host','port','username','password','remember','token']);
  $('host').value = saved.host || '';
  $('port').value = saved.port || '1080';
  $('username').value = saved.username || '';
  $('remember').checked = Boolean(saved.remember);
  $('password').value = saved.remember ? saved.password || '' : '';
  $('token').value = saved.token || '';
  if (!saved.token) $('token').closest('details').open = true;
  await refresh();
}

$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  notice('');
  const host = $('host').value.trim();
  const port = Number($('port').value);
  const username = $('username').value;
  const password = $('password').value;
  const token = $('token').value.trim();
  if (!host || host.includes('://') || /\s/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    return notice('Isi Host tanpa skema dan Port 1 sampai 65535.');
  }
  if (!username || !password) return notice('Username dan password wajib diisi.');
  if (!token) {
    $('token').closest('details').open = true;
    return notice('Masukkan pairing key dari terminal bridge.');
  }
  busy(true);
  try {
    await api('/configure', token, { host, port, username, password });
    await action('connect');
    await chrome.storage.local.set({
      host, port, username, token, remember: $('remember').checked,
      password: $('remember').checked ? password : ''
    });
    notice('Terhubung. Gunakan Cek IP untuk memastikan alamat IP publik.', true);
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
    if (key) { try { await api('/disconnect', key, {}); } catch (_) {} }
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
    const saved = await chrome.storage.local.get(['token']);
    const key = $('token').value.trim() || saved.token;
    if (!key) throw new Error('Masukkan pairing key dan hubungkan proxy dahulu.');
    const result = await api('/test', key, {});
    notice(result.message || 'Uji koneksi berhasil.', true);
  } catch (error) {
    notice(error.message);
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
