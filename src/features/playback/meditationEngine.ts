import { db } from '../../db/db';
import { assetObjectUrl } from '../../assetPipeline/importAssets';

// The gapless meditation engine. Segments decode into one AudioContext
// and are scheduled sample-accurately, silences being scheduled gaps.
// Output routes through a MediaStream into a real audio element, which
// keeps playback alive with the phone screen off and carries Media
// Session metadata; the element must be confirmed flowing before
// anything is scheduled, because a live stream has no rewind. Loudness
// is equalized per voice segment with the boost capped; music is never
// equalized, only the user's slider. Seeking reschedules the chain from
// any point, starting mid-buffer where needed.

export type EngineSegment =
  | { kind: 'audio'; assetId: string; label?: string }
  | { kind: 'silence'; seconds: number; label?: string };

type LoadedSegment =
  | { kind: 'audio'; buffer: AudioBuffer; gain: number; label?: string }
  | { kind: 'silence'; seconds: number; label?: string };

const TARGET_RMS = 0.08;
const MAX_BOOST = 4; // +12 dB

function measureGain(buffer: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i += 32) {
      sum += data[i] * data[i];
      count++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  if (rms < 0.0005) return 1;
  return Math.min(MAX_BOOST, TARGET_RMS / rms);
}

function segLength(seg: LoadedSegment): number {
  return seg.kind === 'silence' ? seg.seconds : seg.buffer.duration;
}

export class MeditationEngine {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private master: GainNode | null = null;
  private element: HTMLAudioElement | null = null;
  private loaded: LoadedSegment[] = [];
  private music: { volume: number; duck: boolean } | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private voiceNodes: AudioBufferSourceNode[] = [];
  private ticker: number | undefined;
  private timeline: { start: number; end: number; voice: boolean; label?: string }[] = [];
  private startAtTime = 0;
  private offsetBase = 0;
  private contentTotal = 0;
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
    await ctx.resume().catch(() => {});
    this.dest = ctx.createMediaStreamDestination();
    this.master = ctx.createGain();
    this.master.connect(this.dest);

    const decode = async (assetId: string): Promise<AudioBuffer | null> => {
      const asset = await db.assets.get(assetId);
      if (!asset) return null;
      try {
        return await ctx.decodeAudioData(await asset.blob.arrayBuffer());
      } catch {
        return null;
      }
    };

    this.loaded = [];
    for (const seg of segments) {
      if (seg.kind === 'silence') {
        this.loaded.push({ kind: 'silence', seconds: seg.seconds, label: seg.label });
      } else {
        const buffer = await decode(seg.assetId);
        if (buffer)
          this.loaded.push({ kind: 'audio', buffer, gain: measureGain(buffer), label: seg.label });
      }
    }
    if (this.ctx !== ctx) return;
    this.contentTotal = this.loaded.reduce((s, seg) => s + segLength(seg), 0);

    if (music) {
      // Music streams through an element instead of decoding: a four
      // hour track plays with seconds of memory, and the session length
      // caps how much of it is ever heard. It still routes through the
      // graph, so the slider, ducking, and the single output remain.
      const asset = await db.assets.get(music.assetId);
      if (this.ctx !== ctx) return;
      if (asset) {
        // The music is its own media element, screen-off capable in its
        // own right, with ducking driven on its volume directly. No
        // graph capture involved, so no capture quirks can defeat it.
        const musicEl = new Audio();
        musicEl.src = assetObjectUrl(asset.id, asset.blob);
        musicEl.loop = true;
        musicEl.volume = music.volume;
        musicEl.style.display = 'none';
        document.body.appendChild(musicEl);
        this.musicElement = musicEl;
        this.music = { volume: music.volume, duck: music.duck };
      }
    }

    // Output first, confirmed flowing, then schedule: a live stream has
    // no rewind, so sound produced before the element runs is lost. The
    // element lives in the DOM because Android silently drops detached
    // stream elements. If the element cannot be proven flowing, the
    // master bus retargets straight to the speakers, trading screen-off
    // support for guaranteed sound this session.
    const el = new Audio();
    el.srcObject = this.dest.stream;
    el.style.display = 'none';
    document.body.appendChild(el);
    this.element = el;
    await el.play().catch(() => {});
    await new Promise<void>((resolve) => {
      const started = performance.now();
      const check = () => {
        if (this.ctx !== ctx) return resolve();
        if (!el.paused && el.currentTime > 0.05) return resolve();
        if (performance.now() - started > 1200) return resolve();
        window.setTimeout(check, 120);
      };
      check();
    });
    if (this.ctx !== ctx) return;
    if (el.paused || el.currentTime <= 0.05) {
      // Element output unavailable: go direct.
      this.master.disconnect();
      this.master.connect(ctx.destination);
      el.remove();
      this.element = null;
    }
    await new Promise((r) => window.setTimeout(r, 450));
    if (this.ctx !== ctx) return;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata(meta);
      navigator.mediaSession.setActionHandler('play', () => void this.resume());
      navigator.mediaSession.setActionHandler('pause', () => void this.pause());
    }

    this.scheduleFrom(0);

    this.ticker = window.setInterval(() => {
      if (!this.ctx || this.ctx.state === 'suspended') return;
      const t = this.ctx.currentTime;
      const voice = this.timeline.some((seg) => seg.voice && t >= seg.start && t < seg.end);
      if (voice !== this.lastVoiceState) {
        this.lastVoiceState = voice;
        this.onVoiceActive?.(voice);
      }
      if (this.music && this.musicElement) {
        const target = this.music.duck && voice ? this.music.volume * 0.3 : this.music.volume;
        const current = this.musicElement.volume;
        const next = current + (target - current) * 0.35;
        this.musicElement.volume = Math.min(1, Math.max(0, Math.abs(next - target) < 0.01 ? target : next));
      }
      const endAt =
        this.startAtTime + (this.contentTotal - this.offsetBase) + 0.3 + (this.music ? 1.5 : 0);
      if (t >= endAt) {
        this.onVoiceActive?.(false);
        this.onEnded?.();
        this.stop();
      }
    }, 250);
  }

  // Clears scheduled sources and reschedules everything from a content
  // offset in seconds, starting mid-buffer where the offset lands
  // inside a recording.
  private scheduleFrom(offset: number): void {
    const ctx = this.ctx;
    const dest = this.dest;
    if (!ctx || !dest) return;

    for (const n of this.voiceNodes) {
      try {
        n.stop();
      } catch {
        // already ended
      }
    }
    this.voiceNodes = [];
    this.timeline = [];

    const startAt = ctx.currentTime + 0.5;
    this.startAtTime = startAt;
    this.offsetBase = Math.min(Math.max(0, offset), this.contentTotal);

    if (this.music && this.musicElement) {
      const dur = this.musicElement.duration;
      if (Number.isFinite(dur) && dur > 0) {
        this.musicElement.currentTime = this.offsetBase % dur;
      }
      void this.musicElement.play().catch(() => {});
    }

    let contentPos = 0;
    let cursor = startAt;
    for (const seg of this.loaded) {
      const len = segLength(seg);
      const segEndContent = contentPos + len;
      if (segEndContent <= this.offsetBase) {
        contentPos = segEndContent;
        continue;
      }
      const into = Math.max(0, this.offsetBase - contentPos);
      const remaining = len - into;
      if (seg.kind === 'silence') {
        this.timeline.push({ start: cursor, end: cursor + remaining, voice: false, label: seg.label });
        cursor += remaining;
      } else {
        const gainNode = ctx.createGain();
        gainNode.gain.value = seg.gain;
        const src = ctx.createBufferSource();
        src.buffer = seg.buffer;
        src.connect(gainNode).connect(this.master ?? dest);
        src.start(cursor, into);
        this.voiceNodes.push(src);
        const segStart = cursor;
        const segEnd = cursor + remaining;
        this.timeline.push({ start: segStart, end: segEnd, voice: true, label: seg.label });
        cursor = segEnd;
      }
      contentPos = segEndContent;
    }
  }

  /** Jump to a content position in seconds and keep playing. */
  async seek(seconds: number): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.resume();
    this.scheduleFrom(seconds);
  }

  progress(): { elapsed: number; total: number; label?: string } | null {
    if (!this.ctx || !this.contentTotal) return null;
    const t = this.ctx.currentTime;
    const elapsed = Math.min(
      this.contentTotal,
      Math.max(0, this.offsetBase + (t - this.startAtTime)),
    );
    const seg = this.timeline.find((s) => t >= s.start && t < s.end);
    return { elapsed, total: this.contentTotal, label: seg?.label };
  }

  setMusicVolume(volume: number): void {
    if (this.music) this.music.volume = volume;
    // The ticker ramps toward the new target while ducking runs; write
    // directly when idle, paused, or not ducking so the slider always
    // answers immediately.
    if (this.musicElement && (!this.ctx || this.ctx.state === 'suspended' || !this.music?.duck)) {
      this.musicElement.volume = Math.min(1, Math.max(0, volume));
    }
  }

  setMusicDuck(duck: boolean): void {
    if (this.music) this.music.duck = duck;
  }

  get playing(): boolean {
    return !!this.ctx;
  }

  get paused(): boolean {
    return this.ctx?.state === 'suspended';
  }

  async pause(): Promise<void> {
    await this.ctx?.suspend();
    this.musicElement?.pause();
    this.element?.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
    await this.musicElement?.play().catch(() => {});
    await this.element?.play().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  stop(): void {
    window.clearInterval(this.ticker);
    this.timeline = [];
    this.lastVoiceState = false;
    for (const n of this.voiceNodes) {
      try {
        n.stop();
      } catch {
        // already ended
      }
    }
    this.voiceNodes = [];
    this.musicElement?.pause();
    this.musicElement?.remove();
    this.musicElement = null;
    this.music = null;
    this.loaded = [];
    this.contentTotal = 0;
    this.offsetBase = 0;
    this.element?.pause();
    if (this.element) {
      this.element.srcObject = null;
      this.element.remove();
    }
    this.element = null;
    this.master = null;
    this.dest = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.onVoiceActive?.(false);
  }
}
