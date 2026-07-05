// KuKuMBA Plinko — canvas scene wrapper. Owns the PlinkoEngine lifecycle and
// forwards the landing callback up to the page (which talks to the plinko API).
import { useEffect, useRef, type MutableRefObject } from 'react';
import { PlinkoEngine, type PlinkoDropInfo } from './engine';

export function PlinkoScene({
  engineRef,
  onLand,
  sound,
  fast,
  texts,
}: {
  engineRef?: MutableRefObject<PlinkoEngine | null>;
  onLand?: (info: PlinkoDropInfo) => void;
  sound: boolean;
  fast?: boolean;
  texts?: { idle?: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eng = useRef<PlinkoEngine | null>(null);
  const cbs = useRef({ onLand });
  cbs.current = { onLand };

  useEffect(() => {
    if (!canvasRef.current) return;
    const e = new PlinkoEngine(canvasRef.current, {
      onLand: (info: PlinkoDropInfo) => cbs.current.onLand?.(info),
      texts,
    });
    eng.current = e;
    if (engineRef) engineRef.current = e;
    e.setSound(sound);
    e.setFast(!!fast);
    e.start();
    // Browsers gate audio behind a user gesture — arm it on the first interaction.
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

  useEffect(() => {
    eng.current?.setSound(sound);
  }, [sound]);
  useEffect(() => {
    eng.current?.setFast(!!fast);
  }, [fast]);
  useEffect(() => {
    if (texts) eng.current?.setTexts(texts);
  }, [texts]);

  return (
    <div className="relative h-[min(56vh,560px)] min-h-[340px] w-full">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
