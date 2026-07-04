// VODKA WIN! — canvas scene wrapper. Owns the CrashEngine lifecycle and forwards
// state/round callbacks up to the page (which talks to the crash API).
import { useEffect, useRef, type MutableRefObject } from 'react';
import { CrashEngine } from './engine';
import type { CrashStatePayload } from './engine';

export function CrashScene({
  engineRef,
  onState,
  onRoundEnd,
  onEvent,
  sound,
  fast,
  texts,
}: {
  engineRef?: MutableRefObject<CrashEngine | null>;
  onState?: (s: CrashStatePayload) => void;
  onRoundEnd?: (crashPoint: number, info: { finale: boolean; lost: boolean; cashedAt: number | null }) => void;
  onEvent?: (name: string, data?: any) => void;
  sound: boolean;
  fast?: boolean;
  texts?: { idle?: string; lost?: string; won?: string; finale?: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eng = useRef<CrashEngine | null>(null);
  // keep latest callbacks without re-creating the engine
  const cbs = useRef({ onState, onRoundEnd, onEvent });
  cbs.current = { onState, onRoundEnd, onEvent };

  useEffect(() => {
    if (!canvasRef.current) return;
    const e = new CrashEngine(canvasRef.current, {
      onState: (s: CrashStatePayload) => cbs.current.onState?.(s),
      onRoundEnd: (cp: number, info: any) => cbs.current.onRoundEnd?.(cp, info),
      onEvent: (name: string, data?: any) => cbs.current.onEvent?.(name, data),
      texts,
    });
    eng.current = e;
    if (engineRef) engineRef.current = e;
    e.setSound(sound);
    e.setFast(!!fast);
    e.start();
    // Music should start on entry, not only once a bet is placed. Browsers gate
    // audio behind a user gesture, so try right away (works if the session is
    // already unlocked) and otherwise arm it on the first interaction anywhere.
    e.resumeAudio();
    const unlock = () => {
      e.resumeAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      e.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { eng.current?.setSound(sound); }, [sound]);
  useEffect(() => { eng.current?.setFast(!!fast); }, [fast]);
  useEffect(() => { if (texts) eng.current?.setTexts(texts); }, [texts]);

  return (
    <div className="relative h-[min(42vh,460px)] min-h-[300px] w-full">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
