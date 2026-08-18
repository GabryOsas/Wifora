/**
 * Web Audio DSP mastering chain constants and specifications.
 */

export const DSP_PRESETS = {
  clarity: {
    name: 'Studio Clarity & Anti-Clipping',
    labelKey: 'dspClarity',
    highpass: { frequency: 20, q: 0.707 },
    clarity: { frequency: 3200, gain: 1.8, q: 1.0 },
    limiter: {
      threshold: -0.5,
      knee: 4.0,
      ratio: 20.0,
      attack: 0.001,
      release: 0.04,
    },
  },
  pure: {
    name: 'Direct / DSP Bypass',
    labelKey: 'dspPure',
    highpass: null,
    clarity: null,
    limiter: null,
  },
  voice: {
    name: 'Dialogue & Vocal Boost',
    labelKey: 'dspVoice',
    highpass: { frequency: 80, q: 0.707 },
    clarity: { frequency: 2800, gain: 4.0, q: 1.2 },
    limiter: {
      threshold: -1.0,
      knee: 3.0,
      ratio: 16.0,
      attack: 0.002,
      release: 0.05,
    },
  },
}
