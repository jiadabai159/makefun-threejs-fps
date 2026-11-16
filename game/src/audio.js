// Synthesised sound: no audio files, everything is WebAudio oscillators and filtered
// noise built on first user gesture. One small helper per sound so the game can call
// audio.shot() or audio.explosion() and never think about nodes.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.32;
    master.connect(context.destination);
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, type = 'square', from = 440, to = 110, gain = 0.5, when = 0 }) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noise({ duration, cutoff = 1200, gain = 0.5, when = 0 }) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    shot() {
      noise({ duration: 0.09, cutoff: 3200, gain: 0.5 });
      burst({ duration: 0.07, type: 'square', from: 220, to: 70, gain: 0.28 });
    },
    enemyShot() {
      noise({ duration: 0.08, cutoff: 1400, gain: 0.16 });
    },
    dry() {
      burst({ duration: 0.03, type: 'square', from: 900, to: 700, gain: 0.14 });
    },
    reload() {
      burst({ duration: 0.04, type: 'square', from: 500, to: 300, gain: 0.16 });
      burst({ duration: 0.04, type: 'square', from: 700, to: 420, gain: 0.16, when: 0.28 });
    },
    hit() {
      burst({ duration: 0.05, type: 'sine', from: 1200, to: 900, gain: 0.3 });
    },
    kill() {
      burst({ duration: 0.08, type: 'sine', from: 880, to: 660, gain: 0.34 });
      burst({ duration: 0.12, type: 'sine', from: 1320, to: 990, gain: 0.3, when: 0.08 });
    },
    hurt() {
      noise({ duration: 0.12, cutoff: 500, gain: 0.4 });
      burst({ duration: 0.14, type: 'sawtooth', from: 160, to: 60, gain: 0.22 });
    },
    grenadeThrow() {
      noise({ duration: 0.15, cutoff: 900, gain: 0.2 });
    },
    explosion() {
      noise({ duration: 0.9, cutoff: 500, gain: 0.85 });
      burst({ duration: 0.8, type: 'sine', from: 120, to: 28, gain: 0.7 });
    },
    beep() {
      burst({ duration: 0.09, type: 'sine', from: 1560, to: 1560, gain: 0.3 });
    },
    plant() {
      burst({ duration: 0.1, type: 'sine', from: 660, to: 660, gain: 0.3 });
      burst({ duration: 0.1, type: 'sine', from: 990, to: 990, gain: 0.3, when: 0.12 });
    },
    buy() {
      burst({ duration: 0.07, type: 'sine', from: 1320, to: 1760, gain: 0.26 });
    },
    roundWin() {
      burst({ duration: 0.16, type: 'triangle', from: 523, to: 523, gain: 0.3 });
      burst({ duration: 0.16, type: 'triangle', from: 659, to: 659, gain: 0.3, when: 0.14 });
      burst({ duration: 0.3, type: 'triangle', from: 784, to: 784, gain: 0.32, when: 0.28 });
    },
    roundLose() {
      burst({ duration: 0.2, type: 'triangle', from: 392, to: 392, gain: 0.3 });
      burst({ duration: 0.34, type: 'triangle', from: 311, to: 311, gain: 0.3, when: 0.18 });
    },
  };
}
