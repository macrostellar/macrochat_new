// Lightweight Web Audio tones - no external audio files needed.
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => undefined);
  return audioCtx;
}

function beep(ctx: AudioContext, freq: number, start: number, duration: number, gainValue = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

let ringtoneTimer: ReturnType<typeof setInterval> | null = null;

export function startRingtone() {
  const ctx = getCtx();
  if (!ctx) return;
  stopRingtone();
  const playPattern = () => {
    const now = ctx.currentTime;
    beep(ctx, 880, now, 0.28);
    beep(ctx, 660, now + 0.32, 0.28);
  };
  playPattern();
  ringtoneTimer = setInterval(playPattern, 1600);
}

export function stopRingtone() {
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
}

export function playNotificationPing() {
  const ctx = getCtx();
  if (!ctx) return;
  beep(ctx, 1046, ctx.currentTime, 0.14, 0.12);
}
