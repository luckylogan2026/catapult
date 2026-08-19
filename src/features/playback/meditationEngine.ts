import { db } from '../../db/db';

// The gapless meditation engine. Segments decode into one AudioContext
// and are scheduled back to back with sample accuracy, silences being
// scheduled gaps. Output routes through a MediaStream into a real audio
// element, which keeps playback alive with the phone screen off and
// carries Media Session metadata. Loudness is equalized per segment: a
// quiet take is lifted and a loud one brought down toward a common
// level, with the boost capped so hiss is not amplified.

export type EngineSegment =
  | { kind: 'audio'; assetId: string }
  | { kind: 'silence'; seconds: number };

type LoadedSegment =
  | { kind: 'audio'; buffer: AudioBuffer; gain: number }
  | { kind: 'silence'; seconds: number };

const TARGET_RMS = 0.08;
const MAX_BOOST = 4; // +12 dB

function measureGain(buffer: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    // Sample every 32nd frame; plenty for an RMS estimate.
    for (let i = 0; i < data.length; i += 32) {
      sum += data[i] * data[i];
      count++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  if (rms < 0.0005) return 1; // effectively silent, leave it alone
  return Math.min(MAX_BOOST, TARGET_RMS / rms);
}

export class MeditationEngine {
  private ctx: AudioContext | null = null;
  private element: HTMLAudioElement | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private voiceNodes: AudioBufferSourceNode[] = [];
  private ticker: number | undefined;
  private schedule: { start: number; end: number }[] = [];
  private totalEnd = 0;
  private lastVoiceState = false;

  onEnded: (() => void) | null = null;
  onVoiceActive: ((active: boolean) => void) | null = null;

  async play(
    segments: EngineSegment[],
    music: { assetId: string; volume: number; duck: boolean } | null,
    meta: { title: string; artist: string },
  ): Promise<void> {
    this.stop();
    const ctx = new AudioContext();
    this.ctx = ctx;
    const dest = ctx.createMediaStreamDestination();

    const decode = async (assetId: string): Promise<AudioBuffer | null> => {
      const asset = await db.assets.get(assetId);
      if (!asset) return null;
      try {
        return await ctx.decodeAudioData(await asset.blob.arrayBuffer());
      } catch {
        return null;
      }
    };

    const loaded: LoadedSegment[] = [];
    for (const seg of segments) {
      if (seg.kind === 'silence') {
        loaded.push({ kind: 'silence', seconds: seg.seconds });
      } else {
        const buffer = await decode(seg.assetId);
        if (buffer) loaded.push({ kind: 'audio', buffer, gain: measureGain(buffer) });
      }
    }
    if (this.ctx !== ctx) return; // stopped while decoding

    // The output element starts FIRST and must be confirmed flowing
    // before anything is scheduled: a live stream has no rewind, so
    // sound produced before the element runs is lost forever. This was
    // audible as the first seconds going missing.
    const el = new Audio();
    el.srcObject = dest.stream;
    this.element = el;
    await el.play().catch(() => {});
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (!el.paused && el.currentTime > 0) done();
      else {
        el.addEventListener('playing', done, { once: true });
        window.setTimeout(done, 700);
      }
    });
    await new Promise((r) => window.setTimeout(r, 150));
    if (this.ctx !== ctx) return; // stopped during startup
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata(meta);
      navigator.mediaSession.setActionHandler('play', () => void el.play());
      navigator.mediaSession.setActionHandler('pause', () => el.pause());
    }

    // Background music: its own loop and gain, live-adjustable.
    if (music) {
      const buffer = await decode(music.assetId);
      if (this.ctx !== ctx) return;
      if (buffer) {
        const gain = ctx.createGain();
        gain.gain.value = music.volume;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(gain).connect(dest);
        src.start();
        this.musicSource = src;
        this.musicGain = gain;
      }
    }

    // Schedule the voice chain, sample-accurate, with duck automation.
    const startAt = ctx.currentTime + 0.25;
    let cursor = startAt;
    for (const seg of loaded) {
      if (seg.kind === 'silence') {
        cursor += seg.seconds;
        continue;
      }
      const gainNode = ctx.createGain();
      gainNode.gain.value = seg.gain;
      const src = ctx.createBufferSource();
      src.buffer = seg.buffer;
      src.connect(gainNode).connect(dest);
      src.start(cursor);
      this.voiceNodes.push(src);
      const segStart = cursor;
      const segEnd = cursor + seg.buffer.duration;
      if (music?.duck && this.musicGain) {
        const g = this.musicGain.gain;
        g.setTargetAtTime(music.volume * 0.3, Math.max(ctx.currentTime, segStart - 0.3), 0.15);
        g.setTargetAtTime(music.volume, segEnd, 0.4);
      }
      this.schedule.push({ start: segStart, end: segEnd });
      cursor = segEnd;
    }

    // Everything follows the context clock, so suspending the context
    // pauses progress tracking along with the sound.
    this.totalEnd = cursor + 0.3 + (music ? 1.5 : 0);
    this.ticker = window.setInterval(() => {
      if (!this.ctx || this.ctx.state === 'suspended') return;
      const t = this.ctx.currentTime;
      const voice = this.schedule.some((seg) => t >= seg.start && t < seg.end);
      if (voice !== this.lastVoiceState) {
        this.lastVoiceState = voice;
        this.onVoiceActive?.(voice);
      }
      if (t >= this.totalEnd) {
        this.onVoiceActive?.(false);
        this.onEnded?.();
        this.stop();
      }
    }, 250);
  }

  setMusicVolume(volume: number): void {
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  get playing(): boolean {
    return !!this.ctx;
  }

  get paused(): boolean {
    return this.ctx?.state === 'suspended';
  }

  async pause(): Promise<void> {
    await this.ctx?.suspend();
    this.element?.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
    await this.element?.play().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  stop(): void {
    window.clearInterval(this.ticker);
    this.schedule = [];
    this.lastVoiceState = false;
    for (const n of this.voiceNodes) {
      try {
        n.stop();
      } catch {
        // already ended
      }
    }
    this.voiceNodes = [];
    try {
      this.musicSource?.stop();
    } catch {
      // already ended
    }
    this.musicSource = null;
    this.musicGain = null;
    this.element?.pause();
    if (this.element) this.element.srcObject = null;
    this.element = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.onVoiceActive?.(false);
  }
}
