# Architecture

SockPilot is intentionally split into two small, auditable components.

## Components

### Browser extension (`extension/`)

- Manifest V3 popup handles user input, displays status, and communicates with the local control API.
- The service worker uses `chrome.proxy.settings` to set the Chromium browser's regular-profile proxy to `127.0.0.1:18080` and to clear it on disconnect.
- It needs the `proxy` and `storage` permissions and `http://127.0.0.1/*` host permission.
- The extension does not implement the SOCKS5 protocol and cannot make Chromium natively negotiate SOCKS5 username/password.

### Node.js bridge (`bridge/`)

- Bound to `127.0.0.1` only. No system-wide proxy changes, drivers, kernel tunnel or privileged service.
- HTTP proxy data port: **18080**. Accepts absolute-form HTTP requests and HTTP `CONNECT` tunnels.
- Control API port: **18081**. Exposes `GET /health` and token-protected `POST /configure`, `/test`, and `/disconnect`.
- On configure, validates the fields, authenticates with the upstream SOCKS5 endpoint and then stores connection configuration in memory.
- For HTTP destinations, connects via SOCKS5 and forwards the request without hop-by-hop proxy headers.
- For HTTPS, tunnels the opaque TCP stream using `CONNECT`. HTTPS encryption is end-to-end between browser and destination site.
- Supports domain-name address type to request *remote destination resolution* by the SOCKS5 server. This does not imply all possible browser DNS activities are proxied.

## Traffic flow

```text
Browser UI -> Chrome extension popup
                  |
                  | control HTTP with bearer pairing key
                  v
        127.0.0.1:18081 (control)
                  |
                  | config in memory
                  v
Browser HTTP proxy 127.0.0.1:18080
                  |
                  | SOCKS5 auth and CONNECT
                  v
          SOCKS5 provider:port
                  |
                  v
             Web server
```

## Persistence

- `bridge/.local/pairing-token` — random 48-hex-character secret, created on first bridge run and ignored by Git.
- `chrome.storage.local` — host, port, username, pairing key and optional password when **Remember password** is selected. Stored without application-level encryption.
- Bridge upstream configuration — in RAM only. Restarting the bridge requires reconnecting from the extension.

## Non-goals for the initial version

- Proxying all OS applications, TUN/VPN behavior, UDP/QUIC support or comprehensive leak prevention.
- Browser-independent proxy switching or automatic per-URL routing.
- A hardened multi-user or hostile-local-process security boundary.
- Remote control API access, public network binding or remote telemetry.

For known risks, read [SECURITY.md](../SECURITY.md).
