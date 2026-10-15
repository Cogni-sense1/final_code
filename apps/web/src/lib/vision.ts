/**
 * Camera and on-device landmark tracking (MediaPipe). Video frames never leave the
 * browser; only the numbers derived from them are sent to the API.
 */
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Lm } from '@neurovoice/shared';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODELS = 'https://storage.googleapis.com/mediapipe-models';

export type Tracker = 'face' | 'hands' | 'pose';
export interface Frame {
  t: number;
  face: Lm[] | null;
  /** Keyed by which of the user's hands it is. */
  hands: { left: Lm[] | null; right: Lm[] | null };
  pose: Lm[] | null;
}

type Detector = { detect(video: HTMLVideoElement, t: number): Partial<Frame>; close(): void };

async function build(kind: Tracker): Promise<Detector> {
  const files = await FilesetResolver.forVisionTasks(WASM);
  const base = (path: string) => ({ baseOptions: { modelAssetPath: `${MODELS}/${path}`, delegate: 'GPU' as const }, runningMode: 'VIDEO' as const });
  if (kind === 'face') {
    const m = await FaceLandmarker.createFromOptions(files, { ...base('face_landmarker/face_landmarker/float16/1/face_landmarker.task'), numFaces: 1 });
    return { detect: (v, t) => ({ face: m.detectForVideo(v, t).faceLandmarks[0] ?? null }), close: () => m.close() };
  }
  if (kind === 'hands') {
    const m = await HandLandmarker.createFromOptions(files, { ...base('hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'), numHands: 2 });
    return {
      detect(v, t) {
        const out = m.detectForVideo(v, t);
        const hands: Frame['hands'] = { left: null, right: null };
        out.landmarks.forEach((lm, i) => {
          // MediaPipe assumes a mirrored selfie image; we pass raw frames, so its labels are swapped.
          const label = out.handedness[i]?.[0]?.categoryName === 'Left' ? 'right' : 'left';
          hands[label] = lm;
        });
        return { hands };
      },
      close: () => m.close(),
    };
  }
  const m = await PoseLandmarker.createFromOptions(files, { ...base('pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'), numPoses: 1 });
  return { detect: (v, t) => ({ pose: m.detectForVideo(v, t).landmarks[0] ?? null }), close: () => m.close() };
}

export type CameraState = 'starting' | 'ready' | 'denied' | 'error';

/**
 * Opens the front camera, runs one tracker on every frame, and hands each result to
 * `onFrame`. The callback is read from a ref so it can change between renders.
 */
export function useTracking(
  kind: Tracker,
  video: RefObject<HTMLVideoElement | null>,
  onFrame: (frame: Frame) => void,
): { state: CameraState; message: string } {
  const [state, setState] = useState<CameraState>('starting');
  const [message, setMessage] = useState('Starting camera');
  const cb = useRef(onFrame);
  cb.current = onFrame;

  useEffect(() => {
    let live = true;
    let raf = 0;
    let stream: MediaStream | null = null;
    let detector: Detector | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      } catch {
        if (live) { setState('denied'); setMessage('Camera access is needed for this check. Allow it in your browser settings and reload.'); }
        return;
      }
      if (!live || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      setMessage('Loading the tracking model');
      try {
        detector = await build(kind);
      } catch {
        if (live) { setState('error'); setMessage('Could not load the tracking model. Check your connection and try again.'); }
        return;
      }
      if (!live) return detector.close();
      setState('ready');
      let last = -1;
      const loop = (): void => {
        const v = video.current;
        if (v && v.readyState >= 2 && v.currentTime !== last) {
          last = v.currentTime;
          const t = performance.now();
          try {
            cb.current({ t, face: null, hands: { left: null, right: null }, pose: null, ...detector!.detect(v, t) });
          } catch {
            // A dropped frame is not worth interrupting the check.
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      detector?.close();
    };
  }, [kind, video]);

  return { state, message };
}

/** Draw landmark dots over the mirrored camera view. */
export function drawPoints(canvas: HTMLCanvasElement | null, video: HTMLVideoElement | null, points: Lm[] | null, color: string, size = 2): void {
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;
  ctx.fillStyle = color;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, size, 0, Math.PI * 2);
    ctx.fill();
  }
}
