# Changelog

Changes to SockPilot are recorded here.

## [Unreleased]

### v1.1.0 — local bridge persistence and IP visibility

- Save pairing key and editable local bridge ports in the browser profile.
- Persist bridge port settings in `bridge/.local/bridge-settings.json` across process restarts.
- Import `host:port:username:password` with one paste; support a colon-containing password.
- Check and show proxy public IP directly in popup through HTTPS over authenticated SOCKS5.
- Cover quick-import parsing and IP-check API authorization in automated tests.


- Public repository setup, contribution and security documentation.
- SockPilot branding and bundled extension icons.
- Manifest V3 browser extension with proxy controls and connection status.
- Dependency-free Node.js local HTTP-to-SOCKS5 bridge.
- Username/password authentication to upstream SOCKS5 (RFC 1929).
- Local pairing key for bridge control API.
- Automated tests for proxying HTTP and HTTPS CONNECT, remote hostnames and authentication.
- GitHub Actions CI for Node.js 20, 22 and 24.

**Note:** The code has passing automated tests. A formal tagged GitHub release and full manual compatibility matrix are not yet available. See [release checklist](docs/RELEASE_CHECKLIST.md).
