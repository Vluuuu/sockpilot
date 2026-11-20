<div align="center">

# 🧭 SockPilot

**Authenticated SOCKS5 for Chromium browsers — without changing your system proxy.**

A lightweight open-source browser extension and local Node.js bridge for SOCKS5 servers that require a **host, port, username, and password**.

[![CI](https://github.com/Vluuuu/sockpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/Vluuuu/sockpilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](https://nodejs.org/)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Bahasa Indonesia](README.id.md)

</div>

> [!IMPORTANT]
> Chrome/Brave do **not** natively support username/password authentication to SOCKS5 servers. SockPilot requires a **local companion bridge** while in use. It changes the Chromium browser's proxy settings, **not** the operating system's proxy settings.

## Features

- **Authenticated SOCKS5** — host, port, username and password (RFC 1928 / RFC 1929).
- **Browser-scoped** — opt in through the extension; no VPN, TUN, drivers or system-wide proxy changes.
- **Connect / disconnect**, connection test and an external IP-check link.
- **Local-only companion** — dependency-free Node.js HTTP-to-SOCKS5 bridge bound to `127.0.0.1`.
- **Pairing key** — protects bridge configuration actions on the local control API.
- **Privacy-conscious defaults** — no analytics, tracking or hosted relay. The bridge keeps upstream credentials in memory, unless you explicitly choose to remember the password in browser extension storage.
- **MIT licensed**, testable and easy to audit.

## How it works

```text
Brave / Chrome / Edge
     │  chrome.proxy -> HTTP proxy 127.0.0.1:18080
     ▼
SockPilot local bridge (Node.js, TCP loopback only)
     │  SOCKS5 + username/password
     ▼
Your SOCKS5 provider
     │
     ▼
Destination website
```

The popup talks to `127.0.0.1:18081` to configure the bridge. Browser web traffic uses `127.0.0.1:18080`. Destination hostnames are sent through SOCKS5; the bridge does not perform local DNS resolution for those destinations. This is an HTTP/HTTPS **TCP** proxy, not a full VPN.

## Requirements

- Windows 10/11 (starter script included), with a Chromium-based browser such as Brave.
- [Node.js 20 or later](https://nodejs.org/).
- A working SOCKS5 service that supports **username/password authentication**.

> Other OSes can run `node bridge/bridge.js`, but the current installation walkthrough is written for Windows.

## Quick start

1. Download or clone the repository:
   ```powershell
   git clone https://github.com/Vluuuu/sockpilot.git
   cd sockpilot
   ```
2. Run **`bridge/start-bridge.cmd`** (or `node bridge/bridge.js`). Keep this terminal open. No `npm install` is necessary.
3. Copy the **pairing key** shown in the terminal. Never publish or share it.
4. Open `brave://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the **`extension/`** directory.
5. Open SockPilot in Brave, enter the SOCKS5 **Host, Port, Username, Password**, then enter the **pairing key** under bridge settings.
6. Click **Connect**, then **Test connection** and **Check IP**. To stop routing Brave traffic, click **Disconnect**.

See [the detailed Indonesian guide](README.id.md) for troubleshooting.

## Development

```bash
npm test           # Node.js built-in test runner; mock SOCKS5 endpoint
npm run bridge     # Start companion on 127.0.0.1
```

There are no third-party runtime dependencies. Changes to extension files can be reloaded from `brave://extensions/`.

```text
extension/           Manifest V3 extension, popup and browser proxy management
bridge/              HTTP-to-SOCKS5 bridge, pairing key and Windows launcher
test/                Local mock SOCKS5 integration tests
.github/workflows/   CI for supported Node.js versions
```

## Limitations & security

- SOCKS5 username/password authentication by itself **is not encrypted** between the bridge and your proxy provider. Use a provider and network you trust; HTTPS still protects HTTPS page content.
- The bridge binds to loopback, but **other local processes** can access its proxy listener. The pairing key protects the *control API*, **not** the data-plane proxy listener.
- If **Remember password** is selected, credentials are stored in `chrome.storage.local` **without application-level encryption**. Do not use that option on shared devices.
- The extension changes the browser profile's regular proxy settings. Other profiles, policies and extensions may influence the final behavior. Only Chromium-compatible **TCP** traffic is supported; WebRTC/UDP and other applications are not comprehensively routed.
- When the bridge stops, proxied browser requests generally fail. **This is not an audited network kill switch.**
- This is an early community project. Automated integration tests are included; live-browser and real-provider compatibility must be validated separately.

Read [SECURITY.md](SECURITY.md) before relying on SockPilot for privacy-sensitive tasks.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). For a security vulnerability, follow [the private reporting guidance](SECURITY.md) instead of publishing exploit details in a public issue.

## References

- [Chromium proxy documentation](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md)
- [Chrome Proxy API](https://developer.chrome.com/docs/extensions/reference/api/proxy)
- [RFC 1928 (SOCKS5)](https://www.rfc-editor.org/rfc/rfc1928)
- [RFC 1929 (username/password)](https://www.rfc-editor.org/rfc/rfc1929)

## License

Released under the [MIT License](LICENSE). © 2026 SockPilot contributors.
