const { useEffect, useMemo, useRef, useState } = React;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = t => 1 - Math.pow(1 - clamp(t), 3);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * clamp(t);

function SceneStage({ children }) {
  const [scenes, setScenes] = useState(window.OM_SCENES);
  const duration = scenes.reduce((total, scene) => total + scene.duration, 0);
  const reducedMotion = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const requestedTime = useMemo(() => new URLSearchParams(location.search).get('t'), []);
  const initial = useMemo(() => clamp(Number(requestedTime || 0), 0, duration), [duration, requestedTime]);
  const [seconds, setSeconds] = useState(reducedMotion ? 2.4 : initial);
  const startedAt = useRef(performance.now() - initial * 1000);
  const frame = useRef();
  const hostControlled = useRef(false);
  const seek = next => { const safe = clamp(Number(next), 0, duration); startedAt.current = performance.now() - safe * 1000; setSeconds(safe); };
  const setSceneDuration = (id, nextDuration) => setScenes(current => { const next = current.map(scene => scene.id === id ? {...scene, duration:Math.max(.1, Number(nextDuration))} : scene); window.OM_SCENES = next; return next; });
  useEffect(() => {
    if (reducedMotion || hostControlled.current || requestedTime !== null) return;
    const tick = now => { setSeconds(((now - startedAt.current) / 1000) % duration); frame.current = requestAnimationFrame(tick); };
    frame.current = requestAnimationFrame(tick);
    const hostSeek = event => { hostControlled.current = true; cancelAnimationFrame(frame.current); seek(event.detail?.seconds ?? event.detail?.time ?? 0); };
    window.addEventListener('data-om-seek-to-time-frame', hostSeek);
    return () => { cancelAnimationFrame(frame.current); window.removeEventListener('data-om-seek-to-time-frame', hostSeek); };
  }, [duration, reducedMotion, requestedTime]);
  let offset = 0, active = scenes[0], local = 0;
  for (const scene of scenes) { if (seconds < offset + scene.duration) { active = scene; local = (seconds - offset) / scene.duration; break; } offset += scene.duration; }
  return children({ scene:active.id, progress:clamp(local), seconds, duration, seek, setSceneDuration, scenes, reducedMotion });
}
