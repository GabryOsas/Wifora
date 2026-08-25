# Guida al Release — Wifora v1.0.0

Checklist operativa per pubblicare la prima versione stabile su GitHub.
Nessuno step richiede strumenti esterni oltre a Git e GitHub.

---

## 1. Pre-flight (prima del tag)

```powershell
# Dipendenze pulite e ambiente verificato
npm ci
npm run lint
npm run format:check
npm test

# (opzionale) rigenera i benchmark aggiornati
npm run benchmark
```

Verifiche manuali:

- [ ] `package.json` → `"version": "1.0.0"` (già corretto).
- [ ] `CHANGELOG.md` contiene la sezione `[1.0.0] - <data release>`.
- [ ] Nessun file sensibile tracciato: `wifora.config.json`,
      `native/wasapi/wifora-audio.exe`, `node_modules/` sono gitignore. Verifica con
      `git status --ignored` che nulla di personale sia incluso.
- [ ] Badge CI verde su `main`.
- [ ] Logo e screenshot aggiornati (se usati nel sito/wiki).

## 2. Tag della release

```bash
git tag -a v1.0.0 -m "Wifora v1.0.0 - First stable release"
git push origin v1.0.0
```

> GitHub genera automaticamente gli archivi sorgente (zip/tar.gz) per ogni tag.

## 3. Pubblicare la Release su GitHub

1. Vai su **Releases → Draft a new release**.
2. Scegli il tag esistente `v1.0.0`.
3. Titolo: `Wifora v1.0.0 — First Stable Release`.
4. Incolla le note qui sotto (sezioni §4).
5. **Asset opzionali consigliati** (non presenti nel repo perché gitignored):
   - `wifora-audio-v1.0.0-win64.zip` contenente `wifora-audio.exe`
     precompilato (build con `native/wasapi/build-wasapi.ps1`).
     Genera il checksum con: `certutil -hashfile wifora-audio.exe SHA256`
     e riportalo nelle note.
6. Spunta **Set as the latest release**, poi **Publish release**.

## 4. Note di rilascio (da incollare nella Release)

```markdown
# Wifora v1.0.0 — First Stable Release

Ultra-low latency Wi-Fi audio streaming from your Windows PC to any browser —
zero app installs, zero cloud, 100% local LAN.

## Highlights

- **35–65 ms typical glass-to-ear latency** over 5 GHz Wi-Fi (Opus 48 kHz stereo).
- **Zero app on receivers**: scan a QR code, listen in Safari/Chrome immediately.
- **ANAE adaptive quality engine**: five tiers from 96 to 256 kbps with
  anti-flapping hysteresis driven by live RTT/jitter/loss telemetry.
- **Glitch-free elastic playout**: AudioWorklet ring buffer with hold-and-fade
  concealment and micro-rate clock-drift correction.
- **Studio DSP chain**: sub-rumble high-pass, dialogue presence EQ, transparent
  peak limiter (-0.5 dBFS).
- **Optional native WASAPI helper** (`wifora-audio.exe`) for robust system-wide
  loopback capture.
- **Security-first**: DTLS-SRTP media encryption, constant-time host key and
  listener token auth, IP rate limiting, strict CSP, zero cloud / zero telemetry.
- **Web Control Center + CLI menu + Windows .bat launchers** for effortless ops.
- **Installable PWA** with offline shell for Android and iOS home screens.

## Requirements

- Host PC: Windows 10/11 with Chrome or Edge, Node.js >= 18.
- Receivers: any modern mobile/desktop browser on the same LAN.

## Install

git clone https://github.com/GabryOsas/Wifora.git
cd Wifora
npm install
npm start

Then open http://localhost:3975, click _Start Audio Broadcast_, share system
audio, and scan the QR code with your phone.

## Full documentation

The complete project wiki (installation, guides, architecture, protocol
reference, security model, benchmarks, troubleshooting) is available at:
https://gabryosas.github.io/Wifora/

## Support

If Wifora is useful to you, consider supporting development:
https://www.buymeacoffee.com/gabryosas
```

## 5. Sito web + Wiki (GitHub Pages)

Il sito è già pronto in `website/` (landing page + wiki completa).

**Attivazione automatica (consigliata):**

1. Il workflow `.github/workflows/pages.yml` pubblica `website/` ad ogni push
   su `main` che tocca quella cartella (o manualmente da **Actions → Deploy
   Website to GitHub Pages → Run workflow**).
2. Una sola volta: **Settings → Pages → Build and deployment → Source =
   GitHub Actions**.

URL finale: `https://gabryosas.github.io/Wifora/` (i link interni sono relativi,
quindi funziona anche sotto path/subpath).

**Alternativa manuale:** carica il contenuto di `website/` su un branch `gh-pages`
e imposta Source = branch `gh-pages`.

## 6. Post-release

- [ ] Aggiornare eventuali link "latest" nei social/README esterni.
- [ ] Creare una discussion o issue pinned per feedback della community.
- [ ] Per la prossima versione: aprire sezione `[Unreleased]` nel CHANGELOG e
      usare versionamento SemVer (`v1.0.x` patch, `v1.x.0` minor).

---

## File inclusi nella pubblicazione

Il repository pubblico contiene tutto ciò che serve agli utenti:

| Incluso                                                                                   | Escluso (gitignore)                        |
| ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| `server.mjs`, `cli-menu.mjs`, `control-center.mjs`, `logger.mjs`                          | `node_modules/`                            |
| `src/` (logica server condivisa)                                                          | `native/wasapi/build/`, `wifora-audio.exe` |
| `public/` (UI host/listener/control + PWA)                                                | `wifora.config.json` (stato locale)        |
| `docs/`, `benchmarks/`, `test/`                                                           | log, `.env*`, metadati OS/IDE              |
| `native/wasapi/` sorgenti C++20 + script build                                            |                                            |
| `website/` (sito + wiki)                                                                  |                                            |
| `README.md`, `CHANGELOG.md`, `LICENSE` (MIT), `.github/` (CI, Dependabot, FUNDING, Pages) |                                            |

L'utente finale compila l'helper WASAPI solo se lo vuole (il percorso browser
funziona senza); in alternativa allega l'exe come asset della release (§3).
