export type AmbientAudioHandle = {
  setVolume: (volume: number) => void;
  stop: () => void;
};

/**
 * Creates a short, looping pink-noise bed through Web Audio. It is an explicit
 * local fallback, not a field recording; approved sound assets can replace it.
 */
export async function startSyntheticWaterAmbience(volumePercent: number): Promise<AmbientAudioHandle> {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio is unavailable in this browser.');
  const context = new AudioContextConstructor();
  try {
    await context.resume();
    const frameCount = Math.max(1, Math.floor(context.sampleRate * 6));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
    for (let index = 0; index < frameCount; index += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      data[index] = Math.max(-1, Math.min(1, pink));
    }
    // Bring each six-second loop to zero at both ends. This avoids an abrupt
    // sample jump at the loop boundary; the short fade is inaudible as a
    // deliberate pause but materially reduces clicks on laptop speakers.
    const fadeFrames = Math.min(Math.floor(context.sampleRate * 0.08), Math.floor(frameCount / 4));
    for (let index = 0; index < fadeFrames; index += 1) {
      const progress = fadeFrames <= 1 ? 1 : index / (fadeFrames - 1);
      const gain = 0.5 - 0.5 * Math.cos(Math.PI * progress);
      const headIndex = index;
      const tailIndex = frameCount - 1 - index;
      data[headIndex] = (data[headIndex] ?? 0) * gain;
      data[tailIndex] = (data[tailIndex] ?? 0) * gain;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 65;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2600;
    const master = context.createGain();
    master.gain.value = Math.max(0, Math.min(80, volumePercent)) / 100 * 0.16;
    source.connect(highpass).connect(lowpass).connect(master).connect(context.destination);
    source.start();

    let stopped = false;
    return {
      setVolume(value) {
        if (stopped) return;
        const safe = Math.max(0, Math.min(80, value)) / 100 * 0.16;
        master.gain.setTargetAtTime(safe, context.currentTime, 0.08);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        try { source.stop(); } catch { /* A concurrent close is harmless. */ }
        void context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}
