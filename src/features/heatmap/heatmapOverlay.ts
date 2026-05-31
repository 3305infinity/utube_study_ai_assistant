import type { HeatmapBucket } from '@/types/ai';

const OVERLAY_ID = 'yt-studyflow-heatmap';

export function renderHeatmapOverlay(buckets: HeatmapBucket[], duration: number): void {
  const bar = document.querySelector('.ytp-progress-bar');
  if (!(bar instanceof HTMLElement) || duration <= 0) return;

  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 100%;
      pointer-events: none;
      z-index: 40;
      display: flex;
    `;
    bar.style.position = 'relative';
    bar.appendChild(overlay);
  }

  overlay.innerHTML = '';
  for (const b of buckets) {
    if (b.density < 0.15) continue;
    const seg = document.createElement('div');
    const left = (b.startTime / duration) * 100;
    const width = ((b.endTime - b.startTime) / duration) * 100;
    const alpha = 0.25 + b.density * 0.55;
    seg.style.cssText = `
      position: absolute;
      left: ${left}%;
      width: ${width}%;
      top: 0; bottom: 0;
      background: rgba(239, 68, 68, ${alpha});
      mix-blend-mode: screen;
    `;
    overlay.appendChild(seg);
  }
}

export function removeHeatmapOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}
