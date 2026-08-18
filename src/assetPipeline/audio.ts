export function audioDurationMs(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('audio decode failed'));
    };
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(audio.duration * 1000));
    };
    audio.src = url;
  });
}
