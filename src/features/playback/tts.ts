// Text to speech through the browser's SpeechSynthesis. Text may carry
// [pause] markers, which insert real silence between spoken segments.
// Available voices depend on the device, and some Android voices need a
// one-time download before they work offline; settings carries that note.

export type TtsHandle = { cancel: () => void };

export function speakText(
  text: string,
  opts: {
    voiceURI?: string;
    rate: number;
    pauseMs: number;
    onActive: (speaking: boolean) => void;
  },
): TtsHandle {
  const segments = text
    .split(/\[pause\]/i)
    .map((s) => s.trim())
    .filter(Boolean);
  let cancelled = false;
  let timer: number | undefined;

  const voice =
    speechSynthesis.getVoices().find((v) => v.voiceURI === opts.voiceURI) ?? null;

  const speakNext = (i: number) => {
    if (cancelled || i >= segments.length) {
      opts.onActive(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(segments[i]);
    if (voice) u.voice = voice;
    u.rate = opts.rate;
    u.onend = () => {
      if (cancelled) return;
      if (i + 1 < segments.length) {
        opts.onActive(false);
        timer = window.setTimeout(() => {
          if (!cancelled) {
            opts.onActive(true);
            speakNext(i + 1);
          }
        }, opts.pauseMs);
      } else {
        opts.onActive(false);
      }
    };
    u.onerror = () => opts.onActive(false);
    speechSynthesis.speak(u);
  };

  if (segments.length) {
    speechSynthesis.cancel();
    opts.onActive(true);
    speakNext(0);
  }

  return {
    cancel: () => {
      cancelled = true;
      window.clearTimeout(timer);
      speechSynthesis.cancel();
      opts.onActive(false);
    },
  };
}
