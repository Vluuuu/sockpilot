# Release checklist

Before creating a tagged public release or distributing a browser package:

## Automated

- [x] Node.js tests for SOCKS5 authentication and HTTP/CONNECT relay.
- [x] CI matrix for Node.js 20, 22, and 24.
- [x] Syntax checks for core JavaScript files.
- [x] Source code and license in GitHub repository.
- [x] Runtime pairing key directory excluded by `.gitignore`.

## Manual compatibility (not yet completed)

- [ ] Fresh Windows 10 installation, Node.js 20, current Brave.
- [ ] Fresh Windows 11 installation, Node.js LTS, current Brave.
- [ ] Extension loads unpacked with no browser errors.
- [ ] Valid provider SOCKS5 username/password succeeds.
- [ ] Invalid password is rejected and does not activate a new upstream.
- [ ] HTTP and HTTPS browse successfully; check public IP.
- [ ] Stop bridge with extension active: document observed behavior.
- [ ] Disconnect: verify normal browser connectivity returns.
- [ ] Browser restart + bridge restart + optional saved password behavior.
- [ ] Conflicting proxy extension and browser policy behavior.
- [ ] WebRTC / DNS behavior documented using real-browser checks.
- [ ] Manual review of permissions, credential handling and network exposure.
- [ ] Review code and artifacts for secrets before creating a GitHub Release.

A green CI badge does **not** imply that the real-browser checklist passed.
