# SockPilot — Panduan Bahasa Indonesia

**SockPilot** adalah extension Manifest V3 untuk Brave dan browser berbasis Chromium yang menggunakan **SOCKS5 dengan Host, Port, Username, dan Password** melalui bridge Node.js lokal. **Tidak mengubah proxy Windows/sistem operasi.**

> **Penting:** Brave/Chromium tidak mendukung username/password SOCKS5 secara langsung. Extension **harus** digunakan bersama bridge lokal. Bridge tidak memasang VPN atau mengubah konfigurasi jaringan komputer.

## Persyaratan

- Windows 10/11 dan Brave (browser Chromium lain mungkin kompatibel, belum semua diuji).
- [Node.js 20+](https://nodejs.org/) sudah terinstal.
- Proxy SOCKS5 yang mendukung autentikasi username/password.

## Instalasi

1. Unduh kode melalui **Code → Download ZIP**, lalu ekstrak, atau jalankan `git clone https://github.com/Vluuuu/sockpilot.git`.
2. Klik dua kali `bridge/start-bridge.cmd`, atau jalankan `node bridge/bridge.js` dari direktori repo. Terminal harus **tetap terbuka**. Tidak perlu `npm install`.
3. Salin **pairing key** 48 karakter yang muncul. **Jangan dibagikan.**
4. Di Brave buka `brave://extensions/`, aktifkan **Developer mode** lalu **Load unpacked**.
5. Pilih folder **`extension`**, bukan root repo dan bukan ZIP.
6. Klik ikon SockPilot; masukkan Host tanpa `socks5://`, Port, Username, dan Password.
7. Buka **Pengaturan bridge**, isi pairing key, lalu klik **Hubungkan proxy**.
8. Klik **Uji koneksi**, kemudian **Cek IP** untuk memastikan IP publik yang digunakan sesuai harapan.
9. Saat ingin berhenti, klik **Matikan proxy** sebelum menutup bridge.

**Catatan:** Restart bridge menghapus kredensial yang disimpan di memorinya. Klik Hubungkan lagi. Password hanya tersimpan di profil extension bila kamu mencentang opsi **Ingat password**.

## Alur

```text
Brave (pengaturan proxy HTTP: 127.0.0.1:18080)
         ↓
Bridge Node.js di laptop (kontrol: 127.0.0.1:18081)
         ↓ autentikasi SOCKS5
Server SOCKS5 kamu
         ↓
Situs web
```

Aplikasi lain tidak otomatis ikut menggunakan proxy. Namun aplikasi lokal **bisa menggunakan** port bridge jika sengaja dikonfigurasi ke sana.

## Masalah yang sering terjadi

| Masalah | Pemeriksaan |
|---|---|
| Bridge belum berjalan | Jalankan `bridge/start-bridge.cmd`. Buka `http://127.0.0.1:18081/health`. |
| Pairing key salah | Salin ulang key dari terminal, atau periksa `bridge/.local/pairing-token` secara privat. |
| Username/password ditolak | Pastikan provider benar-benar menggunakan SOCKS5 dengan autentikasi username/password. |
| Tidak bisa konek | Periksa host, port, koneksi internet, firewall dan server provider. |
| Proxy tidak aktif di Brave | Nonaktifkan extension proxy lain yang bentrok atau kebijakan browser yang memblokir. |
| Port sudah dipakai | Pastikan tidak ada proses lain di 18080 dan 18081. |
| IP belum berubah | Coba **Uji koneksi**, lalu **Cek IP**; pastikan extension dan bridge masih berjalan. |

## Privasi dan keamanan

- SOCKS5 username/password **tidak mengenkripsi koneksi ke provider** secara bawaan.
- **Ingat password** menyimpan password di `chrome.storage.local`, tanpa enkripsi tambahan aplikasi.
- **Pairing key** melindungi API kontrol, tetapi **bukan port HTTP proxy lokal**.
- Bridge hanya menerima koneksi dari `127.0.0.1`; jangan pernah mengeksposnya ke jaringan/internet.
- SockPilot bukan VPN, tidak menjamin anonimitas atau mengalihkan WebRTC/UDP.
- Saat bridge mati, koneksi yang memerlukan proxy dapat gagal; tidak ada jaminan kill switch.

Dokumentasi utama: [README.md](README.md). Pelaporan masalah keamanan: [SECURITY.md](SECURITY.md). Lisensi: [MIT](LICENSE).