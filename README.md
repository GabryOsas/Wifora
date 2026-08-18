<div align="center">

<img src="public/wifora-logo.png" alt="Wifora Logo" width="130" style="border-radius: 24px; margin-bottom: 12px;" />

# WIFORA
### Ultra-Low Latency Wi-Fi Audio Streaming • Zero App Required

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![WebRTC](https://img.shields.io/badge/WebRTC-Opus%2048kHz%20Stereo-333333?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20iOS%20%7C%20Android-0078D4?style=for-the-badge&logo=windows&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Zero App](https://img.shields.io/badge/Zero%20App-Pure%20Web%20Browser-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)

<p align="center">
  <b>🇮🇹 <a href="#-italiano">Italiano</a></b> •
  <b>🇬🇧 <a href="#-english">English</a></b> •
  <b>🇫🇷 <a href="#-français">Français</a></b> •
  <b>🇩🇪 <a href="#-deutsch">Deutsch</a></b>
</p>

---

</div>

<br/>

<div id="-italiano"></div>

## 🇮🇹 Italiano

**Wifora** è una soluzione open-source ad altissime prestazioni che trasmette l'audio di sistema del tuo PC Windows su qualsiasi smartphone, tablet o dispositivo portatile (iPhone, iPad, Android) collegato alla stessa rete Wi-Fi locale.

Non richiede l'installazione di **alcuna app** sui dispositivi riceventi: sfrutta nativamente WebRTC e le Web Audio API moderne direttamente da Safari iOS, Google Chrome o qualsiasi altro browser.

---

### ✨ Funzionalità Principali

- 🚀 **Zero App & Zero Configurazione**: Inquadra il QR Code o digita il codice a 8 caratteri nel browser dello smartphone per iniziare l'ascolto istantaneo.
- ⚡ **Latenza Ultra-Bassa (10-20 ms)**: Streaming real-time ideale per film, video YouTube, podcast, serie TV e gaming.
- 🎧 **Audio Stereo Fullband 48 kHz**: Codifica Opus ad alta fedeltà con bitrate dinamico da 96 fino a 384 kbps.
- 🧠 **Motore ANAE (Adaptive Network & Audio Engine)**: Auto-regolazione continua del bitrate e della resilienza in base alla qualità del segnale Wi-Fi con isteresi anti-flapping.
- 🎛️ **Pipeline DSP da Studio Integrata**:
  - *Studio Clarity & Anti-Clipping*: Limiter trasparente a 1 ms e filtro sub-bass a 20 Hz per eliminare rimbombi impercettibili.
  - *Booster Voci & Dialoghi*: Equalizzazione mirata con boost a 3.2 kHz per la massima intelligibilità del parlato.
  - *Diretto Bit-Perfect*: Bypass totale del DSP per un flusso bit-a-bit puro e inalterato.
- 🛡️ **Privacy Totale in Rete Locale (LAN)**: Flusso confinato esclusivamente alla rete Wi-Fi domestica con crittografia end-to-end DTLS-SRTP.
- 📱 **Supporto Schermo Attivo & iOS AudioSession**: Mantiene attivo lo schermo e instrada correttamente l'audio come canale multimediale su iPhone e iPad evitando l'altoparlante delle chiamate.

---

### 📥 Download & Installazione

#### Prerequisiti
- **Computer Windows** (Windows 10 / 11)
- **[Node.js](https://nodejs.org)** (versione 18.0 o superiore consigliata)
- PC e smartphone connessi alla **stessa rete Wi-Fi o Ethernet locale**

#### 1. Download del Progetto
Puoi clonare il repository con Git oppure scaricare il pacchetto ZIP:
```bash
git clone https://github.com/GabryOsas/Wifora.git
cd Wifora
```

#### 2. Installazione delle Dipendenze
Apri un terminale nella cartella del progetto ed esegui:
```bash
npm install
```

---

### 🚀 Utilizzo

#### Avvio Rapido (Windows)
1. Fai doppio clic sul file **`Avvia-Wifora.bat`** (oppure esegui `npm start` / `npm run menu` nel terminale).
2. Si aprirà il browser sulla dashboard di Wifora (`http://localhost:3975/host.html`).
3. Clicca su **"Avvia Trasmissione Audio"**.
4. Nella finestra di condivisione di Windows/Browser:
   - Seleziona la scheda **"Schermo intero"** (Entire Screen).
   - Spunta la casella **"Condividi audio di sistema"** (Share system audio).
5. Sul tuo smartphone o tablet:
   - Inquadra il **QR Code** visualizzato sullo schermo del PC (oppure apri l'indirizzo LAN indicato, es. `http://192.168.1.X:3975/listen.html?room=...`).
   - L'audio inizierà a riprodursi istantaneamente in cuffia o dagli altoparlanti!

#### Arresto della Trasmissione
- Dalla dashboard web: clicca su **"Termina Trasmissione"**.
- Dal computer: fai doppio clic su **`Termina-Wifora.bat`** oppure premi `[S]` o `[Q]` nel menu CLI.

---

### 🔬 Come Funziona Tecnicamente

```
+-------------------------------------------------------------------------------+
|                                  PC HOST                                      |
|                                                                               |
|  [System Audio]                                                               |
|         |                                                                     |
|  [Web Audio API Graph] -> [20Hz High-Pass] -> [3.2kHz EQ] -> [Peak Limiter]   |
|         |                                                                     |
|  [WebRTC PeerConnection] <== (DTLS-SRTP Opus 48kHz Stereo 20ms Frames) ==>    |
|         ^                                                                     |
|         | WebSocket Signals (/signal) & Keep-Alive Heartbeat                  |
+---------|---------------------------------------------------------------------+
          |                                  LAN Wi-Fi
          v
+-------------------------------------------------------------------------------+
|                            SMARTPHONE (RICEVITORE)                            |
|                                                                               |
|  [Safari iOS / Chrome Mobile]                                                 |
|         |                                                                     |
|  [WebRTC PeerConnection] -> [Adaptive Jitter Buffer 22-50ms]                 |
|         |                                                                     |
|  [AudioSession: media playback] -> [Cuffie / Altoparlanti Stereo]             |
+-------------------------------------------------------------------------------+
```

1. **Cattura e DSP Graph (Web Audio API)**:
   L'audio di sistema viene catturato tramite `getDisplayMedia({ systemAudio: 'include' })` a 48.000 campioni/s. La traccia video viene arrestata istantaneamente per riservare il 100% della CPU e della banda all'audio. Il flusso passa attraverso un grafo audio comprendente un filtro passa-alto Butterworth a 20 Hz, un filtro parametrico di chiarezza a 3.2 kHz e un limiter dinamico trasparente.

2. **Ottimizzazione SDP Opus per LAN Wi-Fi**:
   Il descrittore SDP viene modificato dinamicamente con i parametri:
   `minptime=10;ptime=20;maxptime=20;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=...`
   - *Frame a 20 ms*: dimezza l'overhead dei pacchetti IP/UDP rispetto ai 10 ms, riducendo le collisioni radio Wi-Fi.
   - *In-band FEC (Forward Error Correction)*: corregge pacchetti persi senza richiedere ritrasmissioni NACK.
   - *DTX Disattivato (`usedtx=0`)*: impedisce latenze all'attacco dei transienti sonori.

3. **Motore ANAE (Adaptive Network & Audio Engine)**:
   L'host interroga ogni secondo le statistiche WebRTC (`getStats()`). Attraverso un filtro EWMA sui valori differenziali di pacchetti inviati e persi (`remote-inbound-rtp`), adatta dinamicamente il bitrate tra 5 livelli (96, 128, 160, 224, 256 kbps). L'isteresi integrata applica un *Fast-Down* immediato su congestione severa e uno *Smooth-Up* (5 cicli stabili consecutivi) prima di salire di livello.

4. **Gestione del Ciclo di Vita e Disconnessione Istantanea**:
   Utilizza `navigator.sendBeacon('/api/leave')` e gli eventi `pagehide`/`visibilitychange` sul client mobile, oltre al rilevamento dello stallo dei report RTCP/STUN sull'host (>3.5s segnale perso, >7.5s pulizia automatica), liberando immediatamente gli slot della stanza sul server.

---

<br/>

<div id="-english"></div>

## 🇬🇧 English

**Wifora** is a high-performance, open-source solution that streams your Windows PC system audio to any smartphone, tablet, or mobile device (iPhone, iPad, Android) on the same local Wi-Fi network.

It requires **zero app installs** on receiving devices: it leverages native WebRTC and modern Web Audio APIs directly in Safari iOS, Google Chrome, or any standard web browser.

---

### ✨ Key Features

- 🚀 **Zero App & Zero Setup**: Simply scan the QR Code or type the 8-character code in your phone's browser to start listening instantly.
- ⚡ **Ultra-Low Latency (10-20 ms)**: Real-time playback ideal for movies, YouTube, podcasts, gaming, and TV shows.
- 🎧 **Studio-Grade 48 kHz Stereo Audio**: Fullband Opus encoding with dynamic bitrates from 96 up to 384 kbps.
- 🧠 **ANAE Engine (Adaptive Network & Audio Engine)**: Continuous real-time bitrate auto-tuning based on Wi-Fi link quality with anti-flapping hysteresis.
- 🎛️ **Built-in Studio DSP Pipeline**:
  - *Studio Clarity & Anti-Clipping*: 1 ms transparent peak limiter and 20 Hz sub-rumble high-pass filter.
  - *Voice & Dialogue Booster*: 3.2 kHz peaking filter for crystal-clear spoken words.
  - *Direct Bit-Perfect*: 100% bit-exact bypass mode for pristine, unprocessed PCM audio.
- 🛡️ **Total Local Network Privacy**: All audio traffic is confined strictly inside your home LAN with DTLS-SRTP end-to-end encryption.
- 📱 **Screen Wake Lock & iOS AudioSession**: Prevents screen sleep and routes audio to dedicated media channels on iPhone and iPad.

---

### 📥 Download & Installation

#### Prerequisites
- **Windows PC** (Windows 10 / 11)
- **[Node.js](https://nodejs.org)** (v18.0 or later recommended)
- PC and phone connected to the **same local Wi-Fi / Ethernet network**

#### 1. Download Repository
Clone the repository using Git or download the ZIP archive:
```bash
git clone https://github.com/GabryOsas/Wifora.git
cd Wifora
```

#### 2. Install Dependencies
Open a command prompt or terminal in the project directory and run:
```bash
npm install
```

---

### 🚀 Usage

#### Quick Start (Windows)
1. Double-click **`Avvia-Wifora.bat`** (or execute `npm start` in your terminal).
2. The Wifora dashboard will open automatically in your browser (`http://localhost:3975/host.html`).
3. Click **"Start Audio Broadcast"**.
4. In the browser screen-sharing dialog:
   - Select the **"Entire Screen"** tab.
   - Check the **"Share system audio"** box.
5. On your smartphone or tablet:
   - Scan the **QR Code** shown on the PC screen (or navigate to the displayed local LAN URL).
   - Audio starts playing in real time through your headphones or phone speakers!

#### Stopping the Broadcast
- From the web dashboard: click **"Stop Broadcast"**.
- From your PC terminal: double-click **`Termina-Wifora.bat`** or press `[S]` / `[Q]` in the CLI menu.

---

### 🔬 Technical Architecture

1. **System Audio Capture & DSP Graph**:
   Audio is captured via `getDisplayMedia({ systemAudio: 'include' })` at 48,000 samples/s. The video track is terminated immediately upon capture to allocate 100% CPU and network bandwidth solely to audio. Audio passes through a non-blocking Web Audio graph (20 Hz Butterworth high-pass, 3.2 kHz dialogue presence boost, and transparent peak limiter).

2. **Opus SDP Packet-Rate & FEC Tuning**:
   Custom Opus SDP parameters are injected:
   `minptime=10;ptime=20;maxptime=20;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=...`
   - *20 ms frame packetization*: cuts packet transmission overhead by 50% compared to 10 ms, avoiding 802.11 Wi-Fi packet collisions.
   - *In-band FEC*: recovers isolated packet losses without retransmission roundtrips.
   - *Disabled DTX (`usedtx=0`)*: eliminates transient attack latency between silence and audio bursts.

3. **ANAE Dynamic Adaptive Engine**:
   The host continuously samples WebRTC inbound/outbound differential telemetry (`getStats()`). An EWMA filter prevents quality oscillations while adjusting between 5 dynamic tiers (96, 128, 160, 224, 256 kbps).

4. **Reliable Lifecycle & Zero-Drop Disconnection**:
   Utilizes `navigator.sendBeacon('/api/leave')` combined with `pagehide` events on mobile browsers and real-time RTCP/STUN staleness detection on the host (>3.5s signal lost warning, >7.5s automatic cleanup).

---

<br/>

<div id="-français"></div>

## 🇫🇷 Français

**Wifora** est une solution open-source haute performance permettant de diffuser l'audio système de votre PC Windows vers n'importe quel smartphone ou tablette (iPhone, iPad, Android) sur le même réseau Wi-Fi local.

Aucune application n'est requise : Wifora utilise nativement WebRTC et l'API Web Audio directement dans Safari iOS, Chrome Mobile ou tout navigateur moderne.

---

### ✨ Points Forts

- 🚀 **Sans Application & Sans Configuration** : Scannez le QR Code ou saisissez le code de la pièce pour écouter instantanément.
- ⚡ **Latence Ultra-Faible (10-20 ms)** : Idéal pour les films, YouTube, les jeux vidéo et les podcasts.
- 🎧 **Qualité Studio Stéréo 48 kHz** : Encodage Opus Fullband de 96 à 384 kbps.
- 🧠 **Moteur ANAE** : Ajustement automatique du débit et de la latence en temps réel selon la qualité Wi-Fi.
- 🎛️ **Traitement Audio DSP Studio** : Limiteur anti-écrêtage, filtre sub-bass à 20 Hz et booster de voix à 3.2 kHz.
- 🛡️ **Confidentialité Totale en Réseau Local (LAN)** : Chiffrement DTLS-SRTP de bout en bout.

---

### 📥 Installation & Utilisation

1. **Cloner ou télécharger** :
   ```bash
   git clone https://github.com/GabryOsas/Wifora.git
   cd Wifora
   npm install
   ```
2. **Lancer Wifora** :
   - Double-cliquez sur `Avvia-Wifora.bat` ou lancez `npm start`.
   - Cliquez sur **"Démarrer la Diffusion Audio"** et cochez **"Partager l'audio du système"**.
   - Scannez le QR Code avec votre téléphone pour écouter !

---

<br/>

<div id="-deutsch"></div>

## 🇩🇪 Deutsch

**Wifora** ist eine hochperformante Open-Source-Lösung für das latenzfreie Streaming von PC-Systemaudio auf Smartphones und Tablets (iPhone, iPad, Android) im selben lokalen WLAN-Netzwerk.

Keine App-Installation erforderlich: Funktioniert direkt über Standard-Webbrowser wie iOS Safari oder Google Chrome via WebRTC.

---

### ✨ Hauptmerkmale

- 🚀 **Keine App Erforderlich**: Einfach QR-Code scannen oder Raumcode eingeben und direkt anhören.
- ⚡ **Ultra-Niedrige Latenz (10-20 ms)**: Perfekt für Filme, Serien, YouTube und Gaming.
- 🎧 **48 kHz Stereo Hi-Fi-Klang**: Fullband Opus-Codec mit adaptivem Bitratenstufen von 96 bis 384 kbps.
- 🧠 **ANAE-Echtzeit-Motor**: Dynamische Anpassung an die WLAN-Signalstärke mit Schutz vor Verbindungsabbrüchen.
- 🎛️ **Studio DSP-Effekte**: Anti-Clipping-Limiter, 20-Hz-Subbass-Filter und Sprachverstärkung bei 3.2 kHz.
- 🛡️ **Volle Privatsphäre im LAN**: Vollständig verschlüsselt (DTLS-SRTP) im Heimnetzwerk ohne Cloud.

---

### 📥 Installation & Verwendung

1. **Herunterladen & Installieren**:
   ```bash
   git clone https://github.com/GabryOsas/Wifora.git
   cd Wifora
   npm install
   ```
2. **Starten**:
   - `Avvia-Wifora.bat` doppelklicken oder `npm start` im Terminal ausführen.
   - Auf **"Audio-Übertragung Starten"** klicken und **"Systemaudio teilen"** auswählen.
   - QR-Code mit dem Smartphone scannen und sofort in bester Qualität hören!

---

<br/>

## 📁 Struttura del Progetto / Project Structure

```
Wifora/
├── public/
│   ├── host.html           # Dashboard Host (PC)
│   ├── host.js             # Logica WebRTC Host, DSP Audio Graph & ANAE Engine
│   ├── listen.html         # Interfaccia Ricevitore Mobile
│   ├── listen.js           # Client WebRTC Ricevitore, WakeLock & Telemetria
│   ├── device-detector.js  # Rilevamento automatico modello e tipo dispositivo
│   ├── i18n.js             # Sistema di localizzazione multilingue (IT, EN, FR, DE)
│   ├── styles.css          # Design moderno UI Dark/Light responsive
│   └── wifora-logo.png     # Logo e asset grafici
├── server.mjs              # Server HTTP & WebSocket Signaling (Node.js)
├── cli-menu.mjs            # Menu terminale interattivo con diagnostica IP/LAN
├── Avvia-Wifora.bat        # Script di avvio rapido in un clic per Windows
├── Termina-Wifora.bat      # Script di arresto rapido per Windows
├── package.json            # Configurazione e dipendenze
├── .gitignore              # Esclusioni Git
└── README.md               # Documentazione multilingue
```

---

## 📜 Licenza / License

Distribuito sotto licenza **MIT**. Consulta il file `LICENSE` per ulteriori dettagli.

Copyright (c) 2026 **[GabryOsas](https://github.com/GabryOsas)**

