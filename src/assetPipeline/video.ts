import { THUMB_EDGE } from './constants';

export type ProcessedVideo = {
  posterBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
  durationMs: number;
};

// Reads intrinsic size and duration, and captures a poster frame near the
// one second mark, without ever attaching the element to the document.
export function processVideo(blob: Blob): Promise<ProcessedVideo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const fail = (msg: string) => {
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };
    video.onerror = () => fail('video decode failed');
    video.onloadedmetadata = () => {
      const seekTo = Math.min(1, (video.duration || 2) / 2);
      video.currentTime = seekTo;
    };
    video.onseeked = async () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const draw = async (edge: number, quality: number): Promise<Blob> => {
          const f = Math.max(w, h) > edge ? edge / Math.max(w, h) : 1;
          const canvas = new OffscreenCanvas(Math.round(w * f), Math.round(h * f));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          return canvas.convertToBlob({ type: 'image/webp', quality });
        };
        const posterBlob = await draw(1920, 0.85);
        const thumbBlob = await draw(THUMB_EDGE, 0.8);
        resolve({ posterBlob, thumbBlob, width: w, height: h, durationMs: Math.round(video.duration * 1000) });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
        video.src = '';
      }
    };
    video.src = url;
  });
}
