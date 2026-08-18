/* ==========================================================================
   WIFORA i18n TRANSLATION SYSTEM
   4 Languages: Italiano (IT), English (EN), Français (FR), Deutsch (DE)
   ========================================================================== */

export const translations = {
  it: {
    // Topbar & Shared
    brandSubtitle: 'Audio Streaming Locale • Zero App',
    themeToggle: 'Cambia tema chiaro/scuro',
    langSelect: 'Lingua',
    toastCopied: 'Indirizzo copiato negli appunti!',
    toastManualCopy: 'Copia manuale richiesta.',
    toastKicked: 'Dispositivo disconnesso.',
    toastRoomEnded: 'La trasmissione è terminata dal PC.',
    toastKickedByHost: 'Sei stato disconnesso dal PC.',
    toastDspClarity: 'Ottimizzazione DSP: Studio Clarity & Anti-Clipping',
    toastDspPure: 'Ottimizzazione DSP: Diretto / DSP Bypass (Zero DSP)',
    toastDspVoice: 'Ottimizzazione DSP: Booster Voci & Dialoghi',

    // Host Homepage
    heroBadge: 'Audio Streaming Locale • Zero App',
    heroHeading: "Porta l'audio del tuo PC ovunque nella stanza.",
    heroDescription:
      'Trasmetti qualsiasi sorgente audio del computer su iPhone, iPad o Android collegati alla stessa rete Wi-Fi. Senza cavi, senza configurazioni complesse e senza installare app.',
    startBroadcastBtn: 'Avvia Trasmissione Audio',
    heroHint:
      'Seleziona <strong>Schermo intero</strong> e attiva <strong>Condividi audio di sistema</strong> nel browser.',
    howItWorksTitle: 'Come Funziona',
    step1Title: 'Avvia dal PC',
    step1Desc: "Premi il pulsante di avvio e autorizza la condivisione dell'audio di sistema.",
    step2Title: 'Inquadra il QR',
    step2Desc: 'Usa la fotocamera del tuo smartphone o inserisci il codice della stanza.',
    step3Title: 'Ascolta Subito',
    step3Desc: "L'audio viene riprodotto istantaneamente in cuffia o dagli altoparlanti del telefono.",
    featuresTitle: 'Vantaggi & Specifiche',
    feature1Title: 'Nessuna App Richiesta',
    feature1Desc: 'Funziona direttamente su Safari iOS, Chrome Mobile o qualsiasi browser standard.',
    feature2Title: 'Opus 48 kHz & DSP Studio',
    feature2Desc: 'Anti-clipping limiter, filtro sub-rumble a 20 Hz e fedeltà stereo a 48.000 campioni/s.',
    feature3Title: '20 ms & Protezione Anti-Lag FEC',
    feature3Desc:
      'Packetization Opus a 20 ms con Forward Error Correction per minimizzare la latenza e annullare micro-scatti.',
    feature4Title: 'Privacy Totale in LAN',
    feature4Desc: "Tutti i dati rimangono all'interno della tua rete Wi-Fi domestica.",

    // Host Active Dashboard
    sessionTitle: 'Sessione in Corso',
    sessionSubtitle: 'Inquadra il QR o inserisci il codice per connettere il telefono.',
    stopBroadcastBtn: 'Termina Trasmissione',
    roomCodeLabel: 'Codice Stanza',
    copyBtn: 'Copia',
    audioControlsTitle: 'Controlli Audio',
    volumeLabel: 'Volume:',
    muteBtn: 'Muto',
    muteActiveBtn: 'Muto (Attivo)',
    devicesTitle: 'Dispositivi Connessi',
    devicesConnectedCount: '{count} collegat{suffix}',
    noDevicesMsg: 'In attesa di connessione... Inquadra il QR con la fotocamera del telefono.',
    disconnectDeviceBtn: 'Disconnetti',
    advancedSettingsTitle: 'Impostazioni Avanzate (Per Esperti)',
    optionalBadge: 'Opzionale',
    advancedIntro:
      'Wifora integra il motore ANAE che regola automaticamente il bitrate (96–256 kbps) e la latenza in tempo reale. Se preferisci, puoi forzare un profilo manuale qui sotto:',
    profileLabel: 'Profilo Trasmissione',
    dspLabel: 'Elaborazione Audio DSP',
    profileAdaptive: 'Auto Intelligente (Dinamico e Sicuro • 96-256k)',
    profileLowLatency: 'Gaming & Bassa Latenza (160 kbps CBR • 20ms)',
    profileHifi: 'Studio Hi-Fi Master (384 kbps • Fullband 48 kHz)',
    profileEco: 'Eco & Massima Stabilità (96 kbps)',
    dspClarity: 'Studio Clarity & Anti-Clipping (Consigliato)',
    dspPure: 'Diretto / DSP Bypass (Zero DSP • Audio Puro)',
    dspVoice: 'Booster Voci & Dialoghi (Film & Podcast)',

    // WebRTC & Subsystem Status
    subsystemTitle: 'Stato Sottosistemi & WebRTC',
    statusConnected: 'CONNECTED',
    statusConnecting: 'CONNECTING',
    statusDegraded: 'DEGRADED',
    statusDisconnected: 'DISCONNECTED',
    subsystemWebrtc: 'WebRTC',
    subsystemSignal: 'Signal',
    subsystemAudio: 'Audio',
    subsystemNetwork: 'Network',
    subsystemSignalWsLive: 'WebSocket Attivo',
    subsystemSignalWsReconnecting: 'Riconnessione WS',
    subsystemSignalWsOffline: 'WS Offline',
    subsystemAudioActive: '48 kHz Stereo WASAPI',
    subsystemAudioMuted: 'Audio In Muto',
    subsystemAudioInactive: 'Audio Inattivo',
    subsystemNetworkLan: 'LAN Attiva',
    subsystemNetworkOffline: 'Nessuna Rete',
    subsystemWebrtcPeers: '{count} Peer Attiv{suffix}',
    subsystemWebrtcIdle: 'In attesa ascoltatori',
    srDeviceJoined: 'Nuovo dispositivo collegato: {name}',
    srDeviceLeft: 'Dispositivo disconnesso: {name}',
    srStateChanged: 'Stato WebRTC: {state}',

    // Host Statuses
    statusBrowserUnsupported: 'Browser non supportato. Usa Google Chrome o Microsoft Edge.',
    statusSelectPrompt: 'Seleziona Schermo intero e attiva "Condividi audio di sistema"...',
    statusNoAudio: 'Nessun audio selezionato. Riprova spuntando "Condividi audio di sistema".',
    statusPermissionDenied: "Condivisione annullata dall'utente.",
    statusEnded: 'Trasmissione terminata.',
    statusError: 'Errore: {msg}',

    // Listener (Mobile)
    desktopNoticeText: "Stai usando un PC. Per trasmettere l'audio dal computer, usa",
    desktopNoticeLink: 'Trasmetti dal PC',
    mobileAdvisoryText: "Stai usando un telefono o tablet. Per ricevere l'audio dal PC, usa",
    mobileAdvisoryLink: 'Ricevi Audio dal PC',
    joinTitle: 'Ricevi Audio dal PC',
    joinSubtitle: 'Inserisci il codice di 8 caratteri mostrato sul computer per iniziare.',
    joinInputPlaceholder: 'ABCD1234',
    listenBtn: 'Ascolta Ora',
    mobileStep1Num: '1. Sul PC',
    mobileStep1Desc: 'Apri Wifora sul computer e clicca su <strong>Avvia Trasmissione</strong>.',
    mobileStep2Num: '2. Sul Telefono',
    mobileStep2Desc: 'Inquadra il QR Code oppure digita il codice a 8 caratteri qui sopra.',
    mobileStep3Num: '3. Rete Wi-Fi',
    mobileStep3Desc: 'Assicurati che PC e telefono siano connessi alla <strong>stessa rete Wi-Fi</strong>.',
    tipsTitle: "Consigli per l'Ascolto",
    tip1Title: 'Schermo Attivo',
    tip1Desc: 'Durante la riproduzione, lascia attivo il toggle per evitare lo standby dello schermo.',
    tip2Title: 'Cuffie & Auricolari',
    tip2Desc: 'Collega le cuffie per un audio stereo pulito ad alta fedeltà a 48 kHz.',
    liveTitle: 'Audio in Diretta',
    liveStatusConnecting: 'Connessione al PC in corso...',
    liveStatusConnected: 'Audio in diretta',
    liveStatusWaitingHost: 'In attesa che il PC avvii la trasmissione...',
    liveStatusWaitingTap: "Tocca per avviare l'audio",
    liveResumePrompt: "Tocca per abilitare l'audio:",
    liveResumeBtn: 'Avvia Audio',
    disconnectBtn: 'Disconnetti',
    wakeLockTitle: 'Mantieni Schermo Attivo',
    wakeLockDesc: "Evita lo standby dello schermo durante l'ascolto.",
    telemetryTitle: 'Dettagli Connessione & Rete',
    telemetrySignal: 'Segnale',
    telemetryLatency: 'Latenza',
    telemetryLoss: 'Perdita',
    telemetryBitrate: 'Bitrate',

    // Telemetry Badges
    wifiExcellent: 'Wi-Fi Ottimo',
    wifiGood: 'Wi-Fi Buono',
    wifiUnstable: 'Wi-Fi Instabile',
    tierMaster: 'Studio Master (256k)',
    tierHd: 'Studio High (224k)',
    tierStandard: 'Standard Bilanciato (160k)',
    tierAntiLag: 'Anti-Lag Resiliente (128k)',
    tierWeak: 'Ultra-Resiliente (96k)',
    badgePending: 'Connessione in corso...',
    liveBadge: 'In diretta',
    wifiLost: 'Segnale Perso',
    telemetryReconnecting: 'Riconnessione...',
  },

  en: {
    // Topbar & Shared
    brandSubtitle: 'Local Audio Streaming • Zero App',
    themeToggle: 'Toggle dark/light theme',
    langSelect: 'Language',
    toastCopied: 'Address copied to clipboard!',
    toastManualCopy: 'Manual copy required.',
    toastKicked: 'Device disconnected.',
    toastRoomEnded: 'Broadcast ended by host PC.',
    toastKickedByHost: 'You were disconnected by the host PC.',
    toastDspClarity: 'DSP Profile: Studio Clarity & Anti-Clipping',
    toastDspPure: 'DSP Profile: Direct / DSP Bypass (No DSP)',
    toastDspVoice: 'DSP Profile: Voice & Dialogue Booster',

    // Host Homepage
    heroBadge: 'Local Audio Streaming • Zero App',
    heroHeading: 'Stream your PC audio anywhere in the room.',
    heroDescription:
      'Broadcast any computer audio source to iPhone, iPad, or Android on the same Wi-Fi network. Zero cables, zero complex setups, and zero app installs.',
    startBroadcastBtn: 'Start Audio Broadcast',
    heroHint: 'Select <strong>Entire Screen</strong> and check <strong>Share system audio</strong> in your browser.',
    howItWorksTitle: 'How It Works',
    step1Title: 'Start on PC',
    step1Desc: 'Click start and authorize sharing system audio.',
    step2Title: 'Scan QR Code',
    step2Desc: 'Use your phone camera or type in the 8-character room code.',
    step3Title: 'Listen Instantly',
    step3Desc: 'Audio plays with sub-frame latency on your headphones or phone speakers.',
    featuresTitle: 'Features & Architecture',
    feature1Title: 'Zero App Required',
    feature1Desc: 'Works directly in iOS Safari, Mobile Chrome, or any modern web browser.',
    feature2Title: 'Opus 48 kHz & Studio DSP',
    feature2Desc: 'Anti-clipping limiter, 20 Hz sub-rumble filter, and 48,000 samples/s stereo fidelity.',
    feature3Title: '20 ms & Anti-Lag FEC Protection',
    feature3Desc: '20 ms Opus packetization with Forward Error Correction to eliminate Wi-Fi packet drops and jitter.',
    feature4Title: '100% Local Privacy',
    feature4Desc: 'All audio and signaling stay strictly within your local home LAN.',

    // Host Active Dashboard
    sessionTitle: 'Active Broadcast',
    sessionSubtitle: 'Scan the QR code or enter the code below to connect your mobile device.',
    stopBroadcastBtn: 'Stop Broadcast',
    roomCodeLabel: 'Room Code',
    copyBtn: 'Copy',
    audioControlsTitle: 'Audio Controls',
    volumeLabel: 'Volume:',
    muteBtn: 'Mute',
    muteActiveBtn: 'Muted (Active)',
    devicesTitle: 'Connected Devices',
    devicesConnectedCount: '{count} connected',
    noDevicesMsg: 'Waiting for listeners... Scan the QR code with your smartphone camera.',
    disconnectDeviceBtn: 'Disconnect',
    advancedSettingsTitle: 'Advanced Settings (Expert Mode)',
    optionalBadge: 'Optional',
    advancedIntro:
      'Wifora ANAE engine automatically optimizes bitrate (96–256 kbps) and latency in real time. You can force a manual profile below:',
    profileLabel: 'Transmission Profile',
    dspLabel: 'Audio DSP Processing',
    profileAdaptive: 'Smart Auto (Adaptive & Resilient • 96-256k)',
    profileLowLatency: 'Gaming & Ultra-Low Latency (160 kbps CBR • 20ms)',
    profileHifi: 'Studio Hi-Fi Master (384 kbps • Fullband 48 kHz)',
    profileEco: 'Eco & High Stability (96 kbps)',
    dspClarity: 'Studio Clarity & Anti-Clipping (Recommended)',
    dspPure: 'Direct / DSP Bypass (No DSP • Pure Audio)',
    dspVoice: 'Voice & Dialogue Booster (Movies & Podcasts)',

    // WebRTC & Subsystem Status
    subsystemTitle: 'Subsystem & WebRTC Diagnostics',
    statusConnected: 'CONNECTED',
    statusConnecting: 'CONNECTING',
    statusDegraded: 'DEGRADED',
    statusDisconnected: 'DISCONNECTED',
    subsystemWebrtc: 'WebRTC',
    subsystemSignal: 'Signal',
    subsystemAudio: 'Audio',
    subsystemNetwork: 'Network',
    subsystemSignalWsLive: 'WebSocket Live',
    subsystemSignalWsReconnecting: 'WS Reconnecting',
    subsystemSignalWsOffline: 'WS Offline',
    subsystemAudioActive: '48 kHz Stereo WASAPI',
    subsystemAudioMuted: 'Audio Muted',
    subsystemAudioInactive: 'Audio Inactive',
    subsystemNetworkLan: 'LAN Interface Active',
    subsystemNetworkOffline: 'Network Offline',
    subsystemWebrtcPeers: '{count} Active Peer{suffix}',
    subsystemWebrtcIdle: 'Awaiting peers',
    srDeviceJoined: 'New listener joined: {name}',
    srDeviceLeft: 'Listener disconnected: {name}',
    srStateChanged: 'WebRTC state: {state}',

    // Host Statuses
    statusBrowserUnsupported: 'Browser not supported. Please use Google Chrome or Microsoft Edge.',
    statusSelectPrompt: 'Select Entire Screen and enable "Share system audio"...',
    statusNoAudio: 'No audio stream selected. Please retry and check "Share system audio".',
    statusPermissionDenied: 'Screen capture permission cancelled by user.',
    statusEnded: 'Broadcast ended.',
    statusError: 'Error: {msg}',

    // Listener (Mobile)
    desktopNoticeText: 'You are on a PC. To broadcast audio from this computer, use',
    desktopNoticeLink: 'Broadcast from PC',
    mobileAdvisoryText: 'You are on a phone or tablet. To receive audio from PC, use',
    mobileAdvisoryLink: 'Receive PC Audio',
    joinTitle: 'Receive PC Audio',
    joinSubtitle: 'Enter the 8-character room code displayed on your PC to start listening.',
    joinInputPlaceholder: 'ABCD1234',
    listenBtn: 'Listen Now',
    mobileStep1Num: '1. On Host PC',
    mobileStep1Desc: 'Open Wifora on your computer and click <strong>Start Audio Broadcast</strong>.',
    mobileStep2Num: '2. On Phone',
    mobileStep2Desc: 'Scan the QR code or type the 8-character code above.',
    mobileStep3Num: '3. Wi-Fi Network',
    mobileStep3Desc: 'Ensure PC and phone are connected to the <strong>same Wi-Fi network</strong>.',
    tipsTitle: 'Listening Recommendations',
    tip1Title: 'Screen Active',
    tip1Desc: 'Keep the screen wake lock enabled during playback to avoid sleep interruptions.',
    tip2Title: 'Headphones & Earbuds',
    tip2Desc: 'Connect headphones for crystal-clear 48 kHz fullband stereo listening.',
    liveTitle: 'Live Audio Stream',
    liveStatusConnecting: 'Connecting to PC host...',
    liveStatusConnected: 'Live audio active',
    liveStatusWaitingHost: 'Waiting for host PC to start broadcast...',
    liveStatusWaitingTap: 'Tap to start playback',
    liveResumePrompt: 'Tap to enable audio:',
    liveResumeBtn: 'Start Audio',
    disconnectBtn: 'Disconnect',
    wakeLockTitle: 'Keep Screen Awake',
    wakeLockDesc: 'Prevents screen standby while listening.',
    telemetryTitle: 'Connection & Network Details',
    telemetrySignal: 'Signal',
    telemetryLatency: 'Latency',
    telemetryLoss: 'Packet Loss',
    telemetryBitrate: 'Bitrate',

    // Telemetry Badges
    wifiExcellent: 'Wi-Fi Excellent',
    wifiGood: 'Wi-Fi Good',
    wifiUnstable: 'Wi-Fi Unstable',
    tierMaster: 'Studio Master (256k)',
    tierHd: 'Studio High (224k)',
    tierStandard: 'Balanced Standard (160k)',
    tierAntiLag: 'Anti-Lag Resilient (128k)',
    tierWeak: 'Ultra-Resilient (96k)',
    badgePending: 'Connecting...',
    liveBadge: 'Live',
    wifiLost: 'Signal Lost',
    telemetryReconnecting: 'Reconnecting...',
  },

  fr: {
    // Topbar & Shared
    brandSubtitle: 'Streaming Audio Local • Sans App',
    themeToggle: 'Changer le thème clair/sombre',
    langSelect: 'Langue',
    toastCopied: 'Adresse copiée dans le presse-papiers !',
    toastManualCopy: 'Copie manuelle requise.',
    toastKicked: 'Appareil déconnecté.',
    toastRoomEnded: 'La diffusion a été interrompue par le PC.',
    toastKickedByHost: 'Vous avez été déconnecté par le PC hôte.',
    toastDspClarity: 'Profil DSP : Studio Clarity & Anti-Clipping',
    toastDspPure: 'Profil DSP : Direct / DSP Bypass (Sans DSP)',
    toastDspVoice: 'Profil DSP : Rehausseur de Voix & Dialogues',

    // Host Homepage
    heroBadge: 'Streaming Audio Local • Sans App',
    heroHeading: "Diffusez l'audio de votre PC n'importe où dans la pièce.",
    heroDescription:
      "Diffusez n'importe quelle source audio de votre ordinateur sur iPhone, iPad ou Android connectés au même réseau Wi-Fi. Sans câble, sans configuration complexe et sans installer d'application.",
    startBroadcastBtn: 'Démarrer la Diffusion Audio',
    heroHint: 'Sélectionnez <strong>Tout l’écran</strong> et activez <strong>Partager l’audio du système</strong>.',
    howItWorksTitle: 'Comment Ça Marche',
    step1Title: 'Sur le PC',
    step1Desc: "Cliquez sur démarrer et autorisez le partage de l'audio du système.",
    step2Title: 'Scannez le QR',
    step2Desc: 'Utilisez la caméra de votre smartphone ou saisissez le code de la pièce.',
    step3Title: 'Écoutez Instantanément',
    step3Desc: "L'audio est lu instantanément au casque ou sur les haut-parleurs du téléphone.",
    featuresTitle: 'Avantages & Spécifications',
    feature1Title: 'Aucune Application Requise',
    feature1Desc: 'Fonctionne directement sur Safari iOS, Chrome Mobile ou tout navigateur moderne.',
    feature2Title: 'Opus 48 kHz & DSP Studio',
    feature2Desc: 'Limiteur anti-écrêtage, filtre sub-rumble à 20 Hz et fidélité stéréo à 48.000 éch/s.',
    feature3Title: '20 ms & Protection Anti-Lag FEC',
    feature3Desc:
      'Paquets Opus de 20 ms avec Forward Error Correction pour réduire la latence et annuler les micro-coupures.',
    feature4Title: 'Confidentialité Totale en LAN',
    feature4Desc: 'Toutes les données audio restent strictement sur votre réseau Wi-Fi local.',

    // Host Active Dashboard
    sessionTitle: 'Diffusion en Cours',
    sessionSubtitle: 'Scannez le QR code ou saisissez le code pour connecter le téléphone.',
    stopBroadcastBtn: 'Arrêter la Diffusion',
    roomCodeLabel: 'Code de la Pièce',
    copyBtn: 'Copier',
    audioControlsTitle: 'Contrôles Audio',
    volumeLabel: 'Volume :',
    muteBtn: 'Muet',
    muteActiveBtn: 'Muet (Actif)',
    devicesTitle: 'Appareils Connectés',
    devicesConnectedCount: '{count} connecté{suffix}',
    noDevicesMsg: 'En attente de connexion... Scannez le QR code avec la caméra du téléphone.',
    disconnectDeviceBtn: 'Déconnecter',
    advancedSettingsTitle: 'Paramètres Avancés (Mode Expert)',
    optionalBadge: 'Optionnel',
    advancedIntro:
      'Wifora ajuste automatiquement le débit (96–256 kbps) et la latence en temps réel grâce au moteur ANAE :',
    profileLabel: 'Profil de Diffusion',
    dspLabel: 'Traitement Audio DSP',
    profileAdaptive: 'Smart Auto (Dynamique & Sûr • 96-256k)',
    profileLowLatency: 'Gaming & Faible Latence (160 kbps CBR • 20ms)',
    profileHifi: 'Studio Hi-Fi Master (384 kbps • Fullband 48 kHz)',
    profileEco: 'Éco & Stabilité Maximale (96 kbps)',
    dspClarity: 'Studio Clarity & Anti-Clipping (Recommandé)',
    dspPure: 'Direct / DSP Bypass (Zéro DSP • Audio Pur)',
    dspVoice: 'Rehausseur de Voix & Dialogues (Films & Podcasts)',

    // WebRTC & Subsystem Status
    subsystemTitle: 'Diagnostics des Sous-systèmes & WebRTC',
    statusConnected: 'CONNECTED',
    statusConnecting: 'CONNECTING',
    statusDegraded: 'DEGRADED',
    statusDisconnected: 'DISCONNECTED',
    subsystemWebrtc: 'WebRTC',
    subsystemSignal: 'Signal',
    subsystemAudio: 'Audio',
    subsystemNetwork: 'Network',
    subsystemSignalWsLive: 'WebSocket Actif',
    subsystemSignalWsReconnecting: 'Reconnexion WS',
    subsystemSignalWsOffline: 'WS Hors-ligne',
    subsystemAudioActive: '48 kHz Stéréo WASAPI',
    subsystemAudioMuted: 'Audio Muet',
    subsystemAudioInactive: 'Audio Inactif',
    subsystemNetworkLan: 'Interface LAN Active',
    subsystemNetworkOffline: 'Réseau Déconnecté',
    subsystemWebrtcPeers: '{count} Pair{suffix} Actif{suffix}',
    subsystemWebrtcIdle: 'En attente de pairs',
    srDeviceJoined: 'Nouvel auditeur connecté : {name}',
    srDeviceLeft: 'Auditeur déconnecté : {name}',
    srStateChanged: 'État WebRTC : {state}',

    // Host Statuses
    statusBrowserUnsupported: 'Navigateur non pris en charge. Utilisez Google Chrome ou Microsoft Edge.',
    statusSelectPrompt: 'Sélectionnez Tout l’écran et cochez "Partager l’audio du système"...',
    statusNoAudio: 'Aucun flux audio sélectionné. Réessayez en cochant "Partager l’audio du système".',
    statusPermissionDenied: "Autorisation de partage annulée par l'utilisateur.",
    statusEnded: 'Diffusion terminée.',
    statusError: 'Erreur : {msg}',

    // Listener (Mobile)
    desktopNoticeText: "Vous utilisez un PC. Pour diffuser l'audio depuis cet ordinateur, utilisez",
    desktopNoticeLink: 'Diffuser depuis le PC',
    mobileAdvisoryText: "Vous utilisez un téléphone ou une tablette. Pour recevoir l'audio du PC, utilisez",
    mobileAdvisoryLink: "Recevoir l'Audio du PC",
    joinTitle: "Recevoir l'Audio du PC",
    joinSubtitle: "Entrez le code à 8 caractères affiché sur l'ordinateur pour commencer.",
    joinInputPlaceholder: 'ABCD1234',
    listenBtn: 'Écouter Maintenant',
    mobileStep1Num: '1. Sur le PC',
    mobileStep1Desc: 'Ouvrez Wifora sur le PC et cliquez sur <strong>Démarrer la Diffusion</strong>.',
    mobileStep2Num: '2. Sur le Téléphone',
    mobileStep2Desc: 'Scannez le QR Code ou saisissez le code à 8 caractères ci-dessus.',
    mobileStep3Num: '3. Réseau Wi-Fi',
    mobileStep3Desc: 'Vérifiez que le PC et le téléphone sont sur le <strong>même réseau Wi-Fi</strong>.',
    tipsTitle: "Conseils d'Écoute",
    tip1Title: 'Écran Actif',
    tip1Desc: "Laissez le verrouillage d'écran actif pour éviter la mise en veille pendant la lecture.",
    tip2Title: 'Casque & Écouteurs',
    tip2Desc: 'Branchez des écouteurs pour profiter du son stéréo haute fidélité 48 kHz.',
    liveTitle: 'Audio en Direct',
    liveStatusConnecting: 'Connexion au PC hôte...',
    liveStatusConnected: 'Audio en direct actif',
    liveStatusWaitingHost: 'En attente du démarrage de la diffusion sur le PC...',
    liveStatusWaitingTap: 'Touchez pour lancer la lecture',
    liveResumePrompt: "Touchez pour activer l'audio :",
    liveResumeBtn: "Démarrer l'Audio",
    disconnectBtn: 'Déconnecter',
    wakeLockTitle: 'Garder l’Écran Allumé',
    wakeLockDesc: "Évite la mise en veille de l'écran pendant l'écoute.",
    telemetryTitle: 'Détails de Connexion & Réseau',
    telemetrySignal: 'Signal',
    telemetryLatency: 'Latence',
    telemetryLoss: 'Perte',
    telemetryBitrate: 'Débit',

    // Telemetry Badges
    wifiExcellent: 'Wi-Fi Excellent',
    wifiGood: 'Wi-Fi Bon',
    wifiUnstable: 'Wi-Fi Instable',
    tierMaster: 'Studio Master (256k)',
    tierHd: 'Studio High (224k)',
    tierStandard: 'Standard Équilibré (160k)',
    tierAntiLag: 'Anti-Lag Résilient (128k)',
    tierWeak: 'Ultra-Résilient (96k)',
    badgePending: 'Connexion en cours...',
    liveBadge: 'En direct',
    wifiLost: 'Signal Perdu',
    telemetryReconnecting: 'Reconnexion...',
  },

  de: {
    // Topbar & Shared
    brandSubtitle: 'Lokales Audio-Streaming • Keine App',
    themeToggle: 'Hell/Dunkel umschalten',
    langSelect: 'Sprache',
    toastCopied: 'Adresse in die Zwischenablage kopiert!',
    toastManualCopy: 'Manuelles Kopieren erforderlich.',
    toastKicked: 'Gerät getrennt.',
    toastRoomEnded: 'Die Übertragung wurde vom PC beendet.',
    toastKickedByHost: 'Sie wurden vom Host-PC getrennt.',
    toastDspClarity: 'DSP-Profil: Studio Clarity & Anti-Clipping',
    toastDspPure: 'DSP-Profil: Direkt / DSP Bypass (Kein DSP)',
    toastDspVoice: 'DSP-Profil: Sprach- & Dialog-Booster',

    // Host Homepage
    heroBadge: 'Lokales Audio-Streaming • Keine App',
    heroHeading: 'Bringen Sie PC-Audio überall in den Raum.',
    heroDescription:
      'Übertragen Sie jede Audioquelle Ihres Computers auf iPhone, iPad oder Android im selben WLAN. Ohne Kabel, ohne komplizierte Einrichtung und ohne App-Installation.',
    startBroadcastBtn: 'Audio-Übertragung Starten',
    heroHint: 'Wählen Sie <strong>Gesamter Bildschirm</strong> und aktivieren Sie <strong>Systemaudio teilen</strong>.',
    howItWorksTitle: 'So Funktioniert Es',
    step1Title: 'Am PC Starten',
    step1Desc: 'Klicken Sie auf Start und autorisieren Sie die Freigabe des Systemaudios.',
    step2Title: 'QR-Code Scannen',
    step2Desc: 'Nutzen Sie die Smartphone-Kamera oder geben Sie den Raumcode ein.',
    step3Title: 'Sofort Hören',
    step3Desc: 'Audio wird verzögerungsfrei über Kopfhörer oder Smartphone-Lautsprecher wiedergegeben.',
    featuresTitle: 'Vorteile & Spezifikationen',
    feature1Title: 'Keine App Erforderlich',
    feature1Desc: 'Funktioniert direkt in iOS Safari, Mobile Chrome oder jedem Standard-Browser.',
    feature2Title: 'Opus 48 kHz & Studio DSP',
    feature2Desc: 'Anti-Clipping-Limiter, 20-Hz-Sub-Rumble-Filter und 48.000 Abtastungen/s Stereo-Klang.',
    feature3Title: '20 ms & Anti-Lag FEC-Schutz',
    feature3Desc:
      '20-ms-Opus-Paketierung mit Forward Error Correction zur Minimierung der Latenz und Beseitigung von Mikrorucklern.',
    feature4Title: 'Volle Privatsphäre im LAN',
    feature4Desc: 'Alle Audiodaten verbleiben ausschließlich in Ihrem lokalen Heim-WLAN.',

    // Host Active Dashboard
    sessionTitle: 'Aktive Übertragung',
    sessionSubtitle: 'Scannen Sie den QR-Code oder geben Sie den Code ein, um das Smartphone zu verbinden.',
    stopBroadcastBtn: 'Übertragung Beenden',
    roomCodeLabel: 'Raumcode',
    copyBtn: 'Kopieren',
    audioControlsTitle: 'Audio-Steuerung',
    volumeLabel: 'Lautstärke:',
    muteBtn: 'Stumm',
    muteActiveBtn: 'Stumm (Aktiv)',
    devicesTitle: 'Verbundene Geräte',
    devicesConnectedCount: '{count} verbunden',
    noDevicesMsg: 'Warte auf Verbindung... Scannen Sie den QR-Code mit der Smartphone-Kamera.',
    disconnectDeviceBtn: 'Trennen',
    advancedSettingsTitle: 'Erweiterte Einstellungen (Experten)',
    optionalBadge: 'Optional',
    advancedIntro: 'Wifora passt Bitrate (96–256 kbps) und Latenz mit dem ANAE-Motor automatisch in Echtzeit an:',
    profileLabel: 'Übertragungsprofil',
    dspLabel: 'Audio-DSP-Verarbeitung',
    profileAdaptive: 'Smart Auto (Dynamisch & Stabil • 96-256k)',
    profileLowLatency: 'Gaming & Niedrige Latenz (160 kbps CBR • 20ms)',
    profileHifi: 'Studio Hi-Fi Master (384 kbps • Fullband 48 kHz)',
    profileEco: 'Öko & Maximale Stabilität (96 kbps)',
    dspClarity: 'Studio Clarity & Anti-Clipping (Empfohlen)',
    dspPure: 'Direkt / DSP Bypass (Kein DSP • Reines Audio)',
    dspVoice: 'Sprach- & Dialog-Booster (Filme & Podcasts)',

    // WebRTC & Subsystem Status
    subsystemTitle: 'Subsystem- & WebRTC-Diagnose',
    statusConnected: 'CONNECTED',
    statusConnecting: 'CONNECTING',
    statusDegraded: 'DEGRADED',
    statusDisconnected: 'DISCONNECTED',
    subsystemWebrtc: 'WebRTC',
    subsystemSignal: 'Signal',
    subsystemAudio: 'Audio',
    subsystemNetwork: 'Network',
    subsystemSignalWsLive: 'WebSocket Aktiv',
    subsystemSignalWsReconnecting: 'WS Neu verbinden',
    subsystemSignalWsOffline: 'WS Offline',
    subsystemAudioActive: '48 kHz Stereo WASAPI',
    subsystemAudioMuted: 'Audio Stummgeschaltet',
    subsystemAudioInactive: 'Audio Inaktiv',
    subsystemNetworkLan: 'LAN-Schnittstelle Aktiv',
    subsystemNetworkOffline: 'Netzwerk Offline',
    subsystemWebrtcPeers: '{count} Aktive Peer{suffix}',
    subsystemWebrtcIdle: 'Warte auf Teilnehmer',
    srDeviceJoined: 'Neuer Teilnehmer verbunden: {name}',
    srDeviceLeft: 'Teilnehmer getrennt: {name}',
    srStateChanged: 'WebRTC-Status: {state}',

    // Host Statuses
    statusBrowserUnsupported: 'Browser nicht unterstützt. Bitte Google Chrome oder Microsoft Edge nutzen.',
    statusSelectPrompt: 'Wählen Sie Gesamter Bildschirm und aktivieren Sie "Systemaudio teilen"...',
    statusNoAudio: 'Kein Audio ausgewählt. Bitte erneut versuchen und "Systemaudio teilen" ankreuzen.',
    statusPermissionDenied: 'Freigabe vom Benutzer abgebrochen.',
    statusEnded: 'Übertragung beendet.',
    statusError: 'Fehler: {msg}',

    // Listener (Mobile)
    desktopNoticeText: 'Sie verwenden einen PC. Um PC-Audio zu übertragen, nutzen Sie',
    desktopNoticeLink: 'Vom PC Übertragen',
    mobileAdvisoryText: 'Sie nutzen ein Smartphone oder Tablet. Um PC-Audio zu empfangen, nutzen Sie',
    mobileAdvisoryLink: 'Audio Empfangen',
    joinTitle: 'PC-Audio Empfangen',
    joinSubtitle: 'Geben Sie den 8-stelligen Code ein, der auf Ihrem Computer angezeigt wird.',
    joinInputPlaceholder: 'ABCD1234',
    listenBtn: 'Jetzt Hören',
    mobileStep1Num: '1. Am PC',
    mobileStep1Desc: 'Öffnen Sie Wifora am PC und klicken Sie auf <strong>Audio-Übertragung Starten</strong>.',
    mobileStep2Num: '2. Am Smartphone',
    mobileStep2Desc: 'Scannen Sie den QR-Code oder tippen Sie den 8-stelligen Code oben ein.',
    mobileStep3Num: '3. WLAN-Netzwerk',
    mobileStep3Desc: 'Stellen Sie sicher, dass PC und Smartphone im <strong>selben WLAN-Netzwerk</strong> sind.',
    tipsTitle: 'Tipps für das Hörerlebnis',
    tip1Title: 'Bildschirm Aktiv',
    tip1Desc: 'Lassen Sie den Bildschirm aktiv, um ein Einschlafen des Audios zu verhindern.',
    tip2Title: 'Kopfhörer & In-Ears',
    tip2Desc: 'Schließen Sie Kopfhörer für kristallklaren 48-kHz-Stereo-Hi-Fi-Sound an.',
    liveTitle: 'Live-Audio',
    liveStatusConnecting: 'Verbindung zum PC wird hergestellt...',
    liveStatusConnected: 'Live-Audio aktiv',
    liveStatusWaitingHost: 'Warte auf Start der Übertragung am PC...',
    liveStatusWaitingTap: 'Tippen zum Starten der Wiedergabe',
    liveResumePrompt: 'Tippen, um Audio zu aktivieren:',
    liveResumeBtn: 'Audio Starten',
    disconnectBtn: 'Trennen',
    wakeLockTitle: 'Bildschirm Aktiv Halten',
    wakeLockDesc: 'Verhindert den Ruhezustand des Bildschirms beim Hören.',
    telemetryTitle: 'Verbindungs- & Netzwerk-Details',
    telemetrySignal: 'Signal',
    telemetryLatency: 'Latenz',
    telemetryLoss: 'Paketverlust',
    telemetryBitrate: 'Bitrate',

    // Telemetry Badges
    wifiExcellent: 'WLAN Exzellent',
    wifiGood: 'WLAN Gut',
    wifiUnstable: 'WLAN Instabil',
    tierMaster: 'Studio Master (256k)',
    tierHd: 'Studio High (224k)',
    tierStandard: 'Standard Ausgeglichen (160k)',
    tierAntiLag: 'Anti-Lag Resilient (128k)',
    tierWeak: 'Ultra-Stabil (96k)',
    badgePending: 'Verbindung läuft...',
    liveBadge: 'Live',
    wifiLost: 'Signal Verloren',
    telemetryReconnecting: 'Neu verbinden...',
  },
}

export const SUPPORTED_LANGS = ['it', 'en', 'fr', 'de']
let currentLang = 'it'

export function getInitialLang() {
  try {
    const saved = localStorage.getItem('wifora_lang')
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved
  } catch {}

  const browser = (navigator.language || '').toLowerCase().slice(0, 2)
  if (SUPPORTED_LANGS.includes(browser)) return browser
  return 'it'
}

export function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = 'it'
  currentLang = lang
  try {
    localStorage.setItem('wifora_lang', lang)
  } catch {}
  document.documentElement.setAttribute('lang', lang)
  applyTranslations()
}

export function t(key, vars = {}) {
  const dict = translations[currentLang] || translations.it
  let val = dict[key] || translations.it[key] || key
  for (const [k, v] of Object.entries(vars)) {
    val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
  }
  return val
}

export function applyTranslations() {
  // Translate standard text content
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    const translated = t(key)
    if (translated) {
      if (el.tagName === 'OPTION') {
        el.textContent = translated
      } else {
        el.innerHTML = translated
      }
    }
  })

  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder')
    const translated = t(key)
    if (translated) el.setAttribute('placeholder', translated)
  })

  // Translate title tooltips
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title')
    const translated = t(key)
    if (translated) el.setAttribute('title', translated)
  })

  // Translate aria-labels
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria')
    const translated = t(key)
    if (translated) el.setAttribute('aria-label', translated)
  })

  // Update active flag or select in UI
  const select = document.querySelector('#langSelect')
  if (select && select.value !== currentLang) {
    select.value = currentLang
  }
}

export function initI18n() {
  const initial = getInitialLang()
  setLanguage(initial)

  const select = document.querySelector('#langSelect')
  if (select) {
    select.value = initial
    select.addEventListener('change', (e) => {
      setLanguage(e.target.value)
    })
  }
}
