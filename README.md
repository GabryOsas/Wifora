<div align="center">

<img src="public/wifora-logo.png" alt="Wifora Logo" width="120" style="border-radius: 20px; margin-bottom: 14px;" />

# Wifora
### Ultra-Low Latency Wi-Fi Audio Streaming • Zero App Required

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![WebRTC](https://img.shields.io/badge/WebRTC-Opus%2048kHz%20Stereo-007ACC?style=flat-square&logo=webrtc&logoColor=white)](https://webrtc.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20iOS%20%7C%20Android-0078D4?style=flat-square&logo=windows&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Zero App](https://img.shields.io/badge/Client-Pure%20Web%20Browser-555555?style=flat-square)](#)

<p align="center">
  <a href="#english">English</a> •
  <a href="#italiano">Italiano</a> •
  <a href="#francais">Français</a> •
  <a href="#deutsch">Deutsch</a>
</p>

---

</div>

<br/>

<div id="english"></div>

## English

**Wifora** is a high-performance, open-source audio streaming server that broadcasts your Windows PC system audio directly to any smartphone, tablet, or secondary computer (iPhone, iPad, Android, Mac, Linux) over your local Wi-Fi network with ultra-low latency (10–20 ms) and studio-grade quality.

It requires **zero application installs** on receiving devices. Wifora leverages native WebRTC data streams and modern Web Audio APIs directly through standard web browsers such as Apple Safari iOS, Google Chrome, Microsoft Edge, and Mozilla Firefox.

---

### Core Features

- **Zero App & Instant Setup**: Scan the generated QR code or enter the 8-character room code on any mobile browser to start playback immediately.
- **Ultra-Low Latency (10–20 ms)**: Real-time synchronization suitable for watching movies, streaming video, gaming, podcasts, and remote monitoring.
- **Fullband 48 kHz Stereo Sound**: High-fidelity Opus compression with dynamic bitrates spanning 96 kbps to 384 kbps.
- **ANAE Engine (Adaptive Network & Audio Engine)**: Real-time, continuous quality auto-tuning based on packet loss and round-trip time (RTT) telemetry with anti-flapping hysteresis.
- **Studio DSP Processing Chain**:
  - *Studio Clarity & Anti-Clipping*: 20 Hz sub-rumble high-pass filter paired with a transparent lookahead peak limiter (-1.0 dBFS threshold, 1 ms attack).
  - *Voice & Dialogue Booster*: 80 Hz low-cut combined with a 3.2 kHz presence boost for enhanced vocal intelligibility.
  - *Direct Bit-Perfect*: 100% bit-exact bypass mode for pristine, unaltered audio output.
- **Complete Local Network Privacy**: All audio packets remain strictly inside your local area network (LAN), encrypted end-to-end via DTLS-SRTP.
- **Screen Wake Lock & iOS AudioSession Integration**: Automatically holds screen wake locks and routes playback through iOS multimedia audio channels rather than call speakers.

---

### Download & Quick Start

#### System Requirements
- **Host Machine**: Windows 10 or Windows 11
- **Runtime**: [Node.js](https://nodejs.org) (v18.0.0 or higher recommended)
- **Network**: Host PC and client devices must be connected to the **same Wi-Fi or Ethernet local network**

#### 1. Clone or Download
```bash
git clone https://github.com/GabryOsas/Wifora.git
cd Wifora
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Run Wifora
- **One-Click Launch**: Double-click `Avvia-Wifora.bat` on Windows.
- **Terminal Launch**: Run `npm start` (direct server) or `npm run menu` (interactive CLI menu).

---

### Usage Guide

1. **Start Broadcast on Host (PC)**:
   - Launch Wifora. The host dashboard opens at `http://localhost:3975/host.html`.
   - Click **Start Audio Broadcast**.
   - In the system sharing dialog, select **Entire Screen** (or a specific window) and make sure **Share system audio** is checked.
2. **Connect Receiver (Phone / Tablet)**:
   - Point your phone camera at the QR code on the PC screen (or navigate to the displayed LAN URL, e.g. `http://192.168.1.X:3975/listen.html?room=...`).
   - Audio begins streaming in real time through your headphones or speakers.
3. **Live Controls & Monitoring**:
   - Change volume and mute state independently from the host dashboard or listener UI.
   - Adjust DSP profiles on the fly without stopping playback.
   - Monitor live telemetry (Round-Trip Time, Packet Loss, Bitrate, and Signal Quality) for each connected listener.
   - Kick or disconnect specific devices directly from the connected devices list.
4. **Stopping the Broadcast**:
   - Click **Stop Broadcast** in the web dashboard, or double-click `Termina-Wifora.bat` on your PC.

---

### Technical Architecture & How It Works

```
                                  HOST SYSTEM (PC)
  +-------------------------------------------------------------------------------+
  |  System Audio Source (48,000 Hz, 2 Channels)                                  |
  |         |                                                                     |
  |  [ Web Audio API Graph ]                                                      |
  |    -> 20 Hz High-Pass Sub Filter (Butterworth, Q = 0.707)                     |
  |    -> 3.2 kHz Dialogue Peaking Filter (Gain = 0 to +3.5 dB)                   |
  |    -> Studio Peak Limiter (Threshold -1.0 dBFS, Ratio 12:1, Attack 1 ms)      |
  |    -> Master Gain & Real-time FFT Analyser (Non-blocking Tap)                 |
  |         |                                                                     |
  |  [ WebRTC RTCPeerConnection ]                                                 |
  |    -> SDP Opus Custom Tuning (20 ms packetization, in-band FEC, DTX disabled)  |
  |    -> ANAE Dynamic Bitrate Controller (96 - 256 kbps auto-adaptation)         |
  +---------|---------------------------------------------------------------------+
            |                                         ^
            | UDP / DTLS-SRTP Audio Packets           | WebSocket Signaling (/signal)
            |                                         | & Real-Time Telemetry
            v                                         |
  +-------------------------------------------------------------------------------+
  |  [ Mobile WebRTC Receiver (Safari iOS / Chrome / Edge) ]                      |
  |    -> Adaptive Jitter Buffer Target (22 ms base, 35 - 50 ms adaptive expansion)|
  |    -> iOS AudioSession Playback Routing (Media Channel)                       |
  |    -> Screen Wake Lock Sentinel API                                           |
  |    -> Fast-Teardown Beacon (POST /api/leave on pagehide/unload)               |
  |         |                                                                     |
  |  Headphones / Stereo Speakers Output                                          |
  +-------------------------------------------------------------------------------+
                                RECEIVER (MOBILE)
```

#### 1. Audio Ingestion & Digital Signal Processing (DSP)
Audio is captured through `navigator.mediaDevices.getDisplayMedia({ systemAudio: 'include' })` at native 48,000 samples/second stereo. The video track is terminated immediately upon stream acquisition, freeing 100% of CPU time and network bandwidth for audio processing.

The stream is piped through a zero-latency Web Audio API graph:
- **Sub-Bass High-Pass Filter**: 20 Hz cut with a 0.707 Q-factor eliminates inaudible subsonic rumble, preventing amplifier saturation and conserving RF packet headroom.
- **Parametric Vocal Presence Filter**: 3.2 kHz peaking filter with adjustable gain for speech clarity.
- **Lookahead Peak Limiter**: Dynamics compressor configured with a fast 1 ms attack and 40 ms release, catching digital peaks above -1.0 dBFS without audible pumping.
- **Parallel FFT Tap**: Level metering is tapped in parallel so audio buffer scheduling is never blocked by UI rendering.

#### 2. Opus Codec & SDP Negotiation
Standard WebRTC SDP offers are dynamically rewritten before signaling:
```text
a=fmtp:111 minptime=10;ptime=20;maxptime=20;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=256000;maxplaybackrate=48000
```
- **20 ms Frame Packetization**: Halves packet overhead compared to 10 ms framing, substantially reducing 802.11 Wi-Fi MAC contention and packet collisions when multiple devices stream concurrently.
- **In-Band Forward Error Correction (FEC)**: Embeds lower-bitrate recovery data for the previous packet into the current packet, allowing packet losses to be corrected without waiting for NACK roundtrips.
- **Disabled Discontinuous Transmission (`usedtx=0`)**: Eliminates the 20–40 ms attack delay that occurs when voice/music transitions from silence.

#### 3. ANAE (Adaptive Network & Audio Engine)
ANAE continuously evaluates the connection health of each connected client every 1,000 ms using WebRTC `getStats()` reports:
- **Differential Packet Sampling**: Evaluates $\Delta\text{PacketsLost} / \Delta\text{PacketsSent}$ over a sliding window rather than cumulative lifetime totals.
- **Exponentially Weighted Moving Averages (EWMA)**: Telemetry values are smoothed ($\alpha = 0.3$) to avoid bitrate oscillations caused by momentary RF fading.
- **5 Dynamic Quality Tiers**:

| Tier | Profile Name | Target Bitrate | Max Target RTT | Max Loss Rate |
| :--- | :--- | :--- | :--- | :--- |
| **5** | Studio Master | 256 kbps | < 25 ms | < 0.2 % |
| **4** | Studio High | 224 kbps | < 50 ms | < 0.8 % |
| **3** | Balanced Standard | 160 kbps | < 85 ms | < 1.8 % |
| **2** | Anti-Lag Resilient | 128 kbps | < 120 ms | < 4.0 % |
| **1** | Ultra-Resilient | 96 kbps | Elevated | Severe |

- **Anti-Flapping Hysteresis**: Degraded conditions trigger an immediate step-down (*Fast-Down*), whereas bandwidth recovery requires 5 consecutive stable cycles (*Smooth-Up*) before stepping up.

#### 4. Dynamic Receiver Jitter Buffer & Lifecycle Watchdog
- **Adaptive Jitter Buffer Target**: On browsers supporting the standard WebRTC Jitter Buffer Target API, the buffer is held at a tight 22 ms during clean reception, dynamically expanding to 35 ms or 50 ms only when sustained network jitter exceeds thresholds.
- **Zero-Drop Teardown Protocol**: Client termination triggers both a WebSocket leave event and an asynchronous `navigator.sendBeacon('/api/leave')` payload via `pagehide`. The host additionally monitors RTCP/STUN report timestamps: if incoming reports stall for > 3.5 seconds, a warning state is displayed; after 7.5 seconds of silence, the connection is automatically cleaned up and the room slot is released.

---

<br/>

<div id="italiano"></div>

## 🇮🇹 Italiano

**Wifora** è una soluzione open-source ad altissime prestazioni che trasmette l'audio di sistema del PC Windows su qualsiasi smartphone, tablet o computer secondario (iPhone, iPad, Android, Mac, Linux) collegato alla stessa rete Wi-Fi locale con latenza ultra-bassa (10–20 ms) e qualità da studio.

Non richiede l'installazione di **nessuna applicazione** sui dispositivi riceventi: sfrutta nativamente WebRTC e le Web Audio API moderne direttamente dai browser standard (Apple Safari iOS, Google Chrome, Microsoft Edge, Mozilla Firefox).

---

### Caratteristiche Principali

- **Zero App e Configurazione Istantanea**: Inquadra il QR code generato o inserisci il codice stanza a 8 caratteri per avviare la riproduzione.
- **Latenza Ultra-Bassa (10–20 ms)**: Sincronizzazione in tempo reale per film, video, serie TV, podcast e sessioni di gaming.
- **Audio Stereo Fullband 48 kHz**: Codifica Opus ad alta fedeltà con bitrate dinamico adattivo da 96 kbps fino a 384 kbps.
- **Motore ANAE (Adaptive Network & Audio Engine)**: Auto-regolazione continua di bitrate e resilienza basata su RTT e packet loss con isteresi anti-flapping.
- **Pipeline DSP da Studio Integrata**:
  - *Studio Clarity & Anti-Clipping*: Filtro passa-alto a 20 Hz per rimuovere rimbombi subsonici unito a un peak limiter trasparente a 1 ms.
  - *Booster Voci & Dialoghi*: Taglio a 80 Hz ed esaltazione a 3.2 kHz per la massima intelligibilità vocale.
  - *Diretto Bit-Perfect*: Bypass completo di qualsiasi elaborazione per un flusso audio bit-a-bit inalterato.
- **Privacy Totale in Rete Locale (LAN)**: Flusso audio confinato all'interno della rete Wi-Fi locale, con crittografia end-to-end DTLS-SRTP.
- **Supporto Screen Wake Lock & iOS AudioSession**: Mantiene attivo lo schermo ed instrada l'audio sul canale multimediale di iPhone/iPad evitando l'altoparlante delle chiamate.

---

### Download & Guida Rapida

#### Requisiti di Sistema
- **PC Host**: Windows 10 o Windows 11
- **Ambiente**: [Node.js](https://nodejs.org) (v18.0.0 o successiva)
- **Rete**: Computer e smartphone connessi alla **stessa rete Wi-Fi o Ethernet locale**

#### 1. Download del Progetto
```bash
git clone https://github.com/GabryOsas/Wifora.git
cd Wifora
```

#### 2. Installazione Dipendenze
```bash
npm install
```

#### 3. Avvio
- **Avvio Rapido**: Fai doppio clic su `Avvia-Wifora.bat`.
- **Da Terminale**: Esegui `npm start` (server diretto) oppure `npm run menu` (menu interattivo da console).

---

### Istruzioni d'Uso

1. **Avvio Trasmissione dal PC**:
   - Apri Wifora. La dashboard si aprirà all'indirizzo `http://localhost:3975/host.html`.
   - Clicca su **Avvia Trasmissione Audio**.
   - Nella finestra di condivisione dello schermo, seleziona **Schermo intero** e spunta **Condividi audio di sistema**.
2. **Connessione Ricevitore (Telefono / Tablet)**:
   - Inquadra il **QR Code** mostrato sullo schermo del PC o naviga sull'indirizzo LAN indicato.
   - L'audio inizierà ad essere riprodotto istantaneamente in cuffia o dagli altoparlanti.
3. **Controlli in Tempo Reale**:
   - Regola volume e muto indipendentemente dalla dashboard host o dallo smartphone.
   - Modifica il profilo DSP al volo durante la trasmissione.
   - Monitora la telemetria di ogni dispositivo (Ping RTT, Perdita Pacchetti, Bitrate e Qualità segnale).
   - Disconnetti o espelli singoli dispositivi dalla lista connessioni.
4. **Arresto**:
   - Clicca su **Termina Trasmissione** nella dashboard web, oppure fai doppio clic su `Termina-Wifora.bat`.

---

<br/>

<div id="francais"></div>

## 🇫🇷 Français

**Wifora** est une solution open-source haute performance permettant de diffuser l'audio système de votre PC Windows vers n'importe quel smartphone, tablette ou ordinateur (iPhone, iPad, Android, Mac, Linux) sur le même réseau Wi-Fi local avec une latence ultra-faible (10–20 ms).

Aucune application n'est requise : Wifora utilise nativement WebRTC et les API Web Audio directement dans Safari iOS, Google Chrome ou tout navigateur standard.

---

### Points Forts
- **Sans Application** : Scannez le QR Code ou saisissez le code à 8 caractères pour écouter immédiatement.
- **Ultra-Faible Latence (10–20 ms)** : Idéal pour les films, YouTube, les jeux vidéo et le streaming.
- **Audio Stéréo 48 kHz Haute Fidélité** : Codec Opus adaptatif de 96 à 384 kbps.
- **Moteur ANAE** : Ajustement dynamique du débit selon les conditions Wi-Fi en temps réel.
- **Traitement DSP Studio** : Limiteur anti-écrêtage à 1 ms, filtre sub-bass à 20 Hz et booster vocal à 3.2 kHz.
- **Confidentialité Totale en LAN** : Flux entièrement chiffré via DTLS-SRTP dans votre réseau local.

---

### Installation & Utilisation
```bash
git clone https://github.com/GabryOsas/Wifora.git
cd Wifora
npm install
```
Double-cliquez sur `Avvia-Wifora.bat` ou lancez `npm start`, cliquez sur **Démarrer la Diffusion Audio**, cochez **Partager l'audio du système** et scannez le QR code avec votre téléphone.

---

<br/>

<div id="deutsch"></div>

## 🇩🇪 Deutsch

**Wifora** ist eine hochperformante Open-Source-Lösung für das latenzfreie Streaming von PC-Systemaudio auf Smartphones, Tablets und andere Endgeräte (iPhone, iPad, Android, Mac, Linux) im selben lokalen WLAN-Netzwerk mit 10–20 ms Latenz.

Keine App-Installation erforderlich: Funktioniert direkt über Standard-Webbrowser wie Apple Safari iOS oder Google Chrome via WebRTC.

---

### Hauptmerkmale
- **Keine App Erforderlich**: Einfach QR-Code scannen oder Raumcode eingeben und direkt anhören.
- **Ultra-Niedrige Latenz (10–20 ms)**: Perfekt für Filme, Serien, YouTube und Gaming.
- **48 kHz Stereo Hi-Fi-Klang**: Fullband Opus-Codec mit adaptivem Bitratenbereich von 96 bis 384 kbps.
- **ANAE-Echtzeit-Motor**: Automatische Anpassung an die WLAN-Verbindungsqualität.
- **Studio DSP-Effekte**: Anti-Clipping-Limiter, 20-Hz-Subbass-Filter und Sprachoptimierung bei 3.2 kHz.
- **Volle Privatsphäre im LAN**: Vollständig verschlüsselt (DTLS-SRTP) im Heimnetzwerk ohne Cloud.

---

### Installation & Verwendung
```bash
git clone https://github.com/GabryOsas/Wifora.git
cd Wifora
npm install
```
`Avvia-Wifora.bat` doppelklicken oder `npm start` ausführen, auf **Audio-Übertragung Starten** klicken, **Systemaudio teilen** auswählen und den QR-Code mit dem Smartphone scannen.

---

<br/>

## Project Structure

```
Wifora/
├── public/
│   ├── host.html           # Host control dashboard interface (PC)
│   ├── host.js             # WebRTC host controller, DSP audio graph & ANAE engine
│   ├── listen.html         # Receiver player interface (Mobile)
│   ├── listen.js           # Receiver WebRTC client, wake lock & telemetry handler
│   ├── device-detector.js  # Client hardware and browser platform detection
│   ├── i18n.js             # Multilingual localization system (EN, IT, FR, DE)
│   ├── styles.css          # Modern responsive dark/light theme stylesheet
│   └── wifora-logo.png     # Logo and visual branding assets
├── server.mjs              # Node.js HTTP & WebSocket signaling server
├── cli-menu.mjs            # Interactive CLI terminal menu with network interface analysis
├── Avvia-Wifora.bat        # Windows one-click launcher
├── Termina-Wifora.bat      # Windows one-click process termination script
├── package.json            # Project configuration and dependencies
├── .gitignore              # Git repository exclusion rules
└── README.md               # Multilingual documentation
```

---

## License

Distributed under the **MIT License**. See the `LICENSE` file for details.

Copyright (c) 2026 **[GabryOsas](https://github.com/GabryOsas)**

