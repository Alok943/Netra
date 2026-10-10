import { useEffect, useRef } from "react";
import { CONFIG } from "../config";
import { trackPolygon } from "../vision/track";
import type { Detection } from "../types";

const COLORS = { very_near: "#ff3b30", near: "#ffd400", far: "#34c759" } as const;

interface Props {
  detections: Detection[];
  width: number;
  height: number;
}

/** Bounding boxes + labels + distance, drawn over the video. Sighted-developer debugging aid. */
export function DebugOverlay({ detections, width, height }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // The track: objects whose base is inside it are announced.
    const poly = trackPolygon(width, height);
    ctx.beginPath();
    poly.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 212, 0, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 212, 0, 0.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    const font = Math.max(14, Math.round(width / 32));
    ctx.font = `bold ${font}px system-ui, sans-serif`;
    for (const d of detections) {
      const [x, y, w, h] = d.bbox;
      const c = COLORS[d.proximity];
      ctx.strokeStyle = c;
      ctx.lineWidth = d.inPath ? 4 : 2;
      ctx.setLineDash(d.inPath ? [] : [8, 6]);
      ctx.strokeRect(x, y, w, h);
      const text = `${d.score < CONFIG.detector.minScore ? "maybe " : ""}${d.label} ${Math.round(d.score * 100)}% ${d.distanceM !== null ? `${d.distanceM}m` : "?"}`;
      const tw = ctx.measureText(text).width + 8;
      const ty = y > font + 6 ? y - font - 6 : y;
      ctx.setLineDash([]);
      ctx.fillStyle = c;
      ctx.fillRect(x, ty, tw, font + 6);
      ctx.fillStyle = "#000";
      ctx.fillText(text, x + 4, ty + font);
    }
  }, [detections, width, height]);

  return <canvas ref={ref} className="overlay" width={width} height={height} aria-hidden="true" />;
}
