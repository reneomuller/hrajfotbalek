"use client";

import { useEffect, useRef } from "react";

/**
 * The landing page's background treatment, ported from the `index.html`
 * reference (`startFX`).
 *
 * Two layers on one fixed canvas behind everything:
 *   1. A static pitch — touchline, halfway line, centre circle, both penalty
 *      and goal areas, penalty spots, the D arcs and the corner arcs — drawn
 *      once into an offscreen canvas and blitted each frame. It reorients
 *      itself: portrait viewports get a vertically-played pitch, landscape a
 *      horizontal one.
 *   2. A live layer — 72 drifting particles that link when close, three slow
 *      volt orbs, and a ball being passed between particles, leaving a trail
 *      and flaring the receiver on arrival. The pointer pulls nearby particles
 *      and draws a link to them.
 *
 * Colour literals live here rather than in the theme because these are canvas
 * paint values, not CSS: `fillStyle` cannot read a Tailwind class. They are the
 * reference's values verbatim and mirror the volt/bone tokens.
 *
 * Respects `prefers-reduced-motion`: the pitch still renders, the animation
 * loop never starts. The static layer is the whole of the design's structure,
 * so a reduced-motion visitor sees the same composition without the movement.
 *
 * TWO INTENSITIES, because this is now site-wide rather than landing-only.
 * `full` is the reference verbatim. `subtle` keeps the same pitch and the same
 * paint values but thins the live layer — a third of the particles, no passing
 * ball, one orb — and drops the whole canvas to a low opacity. That is the
 * distinction the design needs: the landing page is mostly background with
 * content on it, while a games list or an admin table is mostly content, and
 * a full-strength particle field behind a dense table competes with the thing
 * the player came to read. The composition is identical either way; only its
 * weight changes.
 */

export type BackgroundIntensity = "full" | "subtle";

interface IntensityConfig {
  particles: number;
  orbs: number;
  /** The passing ball is the loudest element; only the landing page gets it. */
  ball: boolean;
  /** Applied to the canvas element, not to any paint value. */
  opacity: string;
}

const INTENSITY: Record<BackgroundIntensity, IntensityConfig> = {
  full: { particles: 72, orbs: 3, ball: true, opacity: "opacity-100" },
  subtle: { particles: 24, orbs: 1, ball: false, opacity: "opacity-40" },
};

const FX = {
  stripe: "rgba(166,232,56,.055)",
  line: "rgba(200,255,0,.30)",
  lineGlow: "rgba(200,255,0,.65)",
  spot: "rgba(200,255,0,.36)",
  orb: "rgba(200,255,0,.07)",
  particle: "rgba(230,240,210,.45)",
  ballTrail: "rgba(200,255,0,",
  ball: "rgba(235,255,190,.55)",
  ballGlow: "rgba(200,255,0,.5)",
} as const;

const TAU = 6.28318;
/** Height of the fixed header, excluded from the pitch's top margin. */
const NAV = 61;

export function PitchBackground({
  intensity = "full",
}: {
  intensity?: BackgroundIntensity;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const { particles: PARTICLE_COUNT, orbs: ORB_COUNT, ball: withBall } =
      INTENSITY[intensity];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pitch = document.createElement("canvas");
    let W = 0;
    let H = 0;

    const drawPitch = () => {
      pitch.width = W;
      pitch.height = H;
      const g = pitch.getContext("2d");
      if (!g) return;

      const vert = H - NAV >= W;
      const m = Math.max(20, Math.min(W, H - NAV) * 0.055);
      const L = m;
      const T = NAV + m;
      const R = W - m;
      const B = H - m;
      const FW = R - L;
      const FH = B - T;
      const cx = (L + R) / 2;
      const cy = (T + B) / 2;

      // Mown stripes, running across the direction of play.
      g.fillStyle = FX.stripe;
      const nS = 12;
      if (vert) {
        const sh = FH / nS;
        for (let i = 0; i < nS; i += 2) g.fillRect(0, T + i * sh, W, sh);
      } else {
        const sw = FW / nS;
        for (let i = 0; i < nS; i += 2) g.fillRect(L + i * sw, 0, sw, H);
      }

      g.strokeStyle = FX.line;
      g.lineWidth = 1.5;
      g.lineJoin = "round";
      g.shadowColor = FX.lineGlow;
      g.shadowBlur = 12;
      g.strokeRect(L, T, FW, FH);

      const cr = Math.min(FW, FH) * 0.155;
      g.beginPath();
      if (vert) {
        g.moveTo(L, cy);
        g.lineTo(R, cy);
      } else {
        g.moveTo(cx, T);
        g.lineTo(cx, B);
      }
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, cr, 0, TAU);
      g.stroke();

      const dot = (px: number, py: number) => {
        g.beginPath();
        g.arc(px, py, 2.4, 0, TAU);
        g.fillStyle = FX.spot;
        g.fill();
      };
      dot(cx, cy);

      const lng = vert ? FH : FW;
      const crs = vert ? FW : FH;
      const paC = crs * 0.6;
      const paD = lng * 0.16;
      const gaC = crs * 0.28;
      const gaD = lng * 0.062;
      const spD = lng * 0.115;
      const rc = Math.min(FW, FH) * 0.03;
      const q = Math.min(1, (paD - spD) / cr);

      if (vert) {
        g.strokeRect(cx - paC / 2, T, paC, paD);
        g.strokeRect(cx - gaC / 2, T, gaC, gaD);
        g.strokeRect(cx - paC / 2, B - paD, paC, paD);
        g.strokeRect(cx - gaC / 2, B - gaD, gaC, gaD);
        dot(cx, T + spD);
        dot(cx, B - spD);
        const a = Math.asin(q);
        g.beginPath();
        g.arc(cx, T + spD, cr, a, Math.PI - a);
        g.stroke();
        g.beginPath();
        g.arc(cx, B - spD, cr, Math.PI + a, TAU - a);
        g.stroke();
      } else {
        g.strokeRect(L, cy - paC / 2, paD, paC);
        g.strokeRect(L, cy - gaC / 2, gaD, gaC);
        g.strokeRect(R - paD, cy - paC / 2, paD, paC);
        g.strokeRect(R - gaD, cy - gaC / 2, gaD, gaC);
        dot(L + spD, cy);
        dot(R - spD, cy);
        const b = Math.acos(q);
        g.beginPath();
        g.arc(L + spD, cy, cr, -b, b);
        g.stroke();
        g.beginPath();
        g.arc(R - spD, cy, cr, Math.PI - b, Math.PI + b);
        g.stroke();
      }

      // Corner arcs.
      g.beginPath();
      g.arc(L, T, rc, 0, Math.PI / 2);
      g.stroke();
      g.beginPath();
      g.arc(R, T, rc, Math.PI / 2, Math.PI);
      g.stroke();
      g.beginPath();
      g.arc(R, B, rc, Math.PI, Math.PI * 1.5);
      g.stroke();
      g.beginPath();
      g.arc(L, B, rc, Math.PI * 1.5, TAU);
      g.stroke();
    };

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      drawPitch();
    };
    resize();
    window.addEventListener("resize", resize);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      ctx.drawImage(pitch, 0, 0);
      return () => window.removeEventListener("resize", resize);
    }

    const M = { x: -9999, y: -9999 };
    const onPointerMove = (e: PointerEvent) => {
      M.x = e.clientX;
      M.y = e.clientY;
    };
    const onPointerLeave = () => {
      M.x = -9999;
      M.y = -9999;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);

    const P = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.34,
      vy: (Math.random() - 0.5) * 0.34,
      r: Math.random() * 1.7 + 0.6,
      g: 0,
    }));
    const orbs = Array.from({ length: ORB_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 240 + 150,
      vx: (Math.random() - 0.5) * 0.13,
      vy: (Math.random() - 0.5) * 0.13,
    }));

    const ball = {
      from: P[0],
      to: P[1],
      t: 1,
      spd: 0.004,
      pause: 60,
      x: 0,
      y: 0,
      trail: [] as { x: number; y: number }[],
    };

    const newPass = () => {
      ball.from = ball.to;
      let pick: (typeof P)[number] | null = null;
      for (let k = 0; k < 20; k++) {
        const cnd = P[(Math.random() * PARTICLE_COUNT) | 0];
        if (cnd === ball.from) continue;
        const d = Math.hypot(cnd.x - ball.from.x, cnd.y - ball.from.y);
        // Prefer a long pass; settle for any other player after 20 tries.
        if (d > Math.min(W, H) * 0.45) {
          pick = cnd;
          break;
        }
        if (!pick) pick = cnd;
      }
      ball.to = pick ?? P[0];
      ball.t = 0;
      ball.spd = Math.min(
        0.006,
        Math.max(
          0.0028,
          2.4 / (Math.hypot(ball.to.x - ball.from.x, ball.to.y - ball.from.y) || 1),
        ),
      );
    };

    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(pitch, 0, 0);

      orbs.forEach((o) => {
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < -o.r) o.x = W + o.r;
        if (o.x > W + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = H + o.r;
        if (o.y > H + o.r) o.y = -o.r;
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, FX.orb);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, TAU);
        ctx.fill();
      });

      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const dx = P[i].x - P[j].x;
          const dy = P[i].y - P[j].y;
          const d = Math.hypot(dx, dy);
          if (d < 126) {
            ctx.strokeStyle = `rgba(200,255,0,${0.17 * (1 - d / 126)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(P[i].x, P[i].y);
            ctx.lineTo(P[j].x, P[j].y);
            ctx.stroke();
          }
        }
      }

      P.forEach((p) => {
        const dx = p.x - M.x;
        const dy = p.y - M.y;
        const d = Math.hypot(dx, dy);
        if (d < 150 && d > 1) {
          ctx.strokeStyle = `rgba(200,255,0,${0.3 * (1 - d / 150)})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(M.x, M.y);
          ctx.stroke();
          if (d < 90) {
            const f = ((90 - d) / 90) * 0.22;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }

        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 1.5) {
          p.vx *= 1.5 / sp;
          p.vy *= 1.5 / sp;
        }
        p.vx *= 0.996;
        p.vy *= 0.996;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) {
          p.x = 0;
          p.vx = Math.abs(p.vx);
        }
        if (p.x > W) {
          p.x = W;
          p.vx = -Math.abs(p.vx);
        }
        if (p.y < 0) {
          p.y = 0;
          p.vy = Math.abs(p.vy);
        }
        if (p.y > H) {
          p.y = H;
          p.vy = -Math.abs(p.vy);
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = FX.particle;
        ctx.fill();

        // Flare on a player who has just received the ball, decaying away.
        if (p.g > 0.04) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 10 * p.g, 0, TAU);
          ctx.strokeStyle = `rgba(200,255,0,${0.55 * p.g})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          p.g *= 0.94;
        }
      });

      if (!withBall) {
        // `subtle` stops here: pitch, orbs, particles and their links, and
        // nothing that draws the eye across the screen.
      } else if (ball.pause > 0) {
        ball.pause--;
      } else if (ball.t < 1) {
        ball.t += ball.spd;
        const t = Math.min(1, ball.t);
        const e = t * t * (3 - 2 * t);
        ball.x = ball.from.x + (ball.to.x - ball.from.x) * e;
        const lift = Math.sin(t * Math.PI) * 8;
        ball.y = ball.from.y + (ball.to.y - ball.from.y) * e - lift;

        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 22) ball.trail.shift();
        ball.trail.forEach((tp, i) => {
          const a = (i + 1) / ball.trail.length;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, 1.8 * a, 0, TAU);
          ctx.fillStyle = `${FX.ballTrail}${0.12 * a})`;
          ctx.fill();
        });

        ctx.save();
        ctx.shadowColor = FX.ballGlow;
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 1.8, 0, TAU);
        ctx.fillStyle = FX.ball;
        ctx.fill();
        ctx.restore();

        if (ball.t >= 1) {
          ball.to.g = 0.7;
          ball.pause = 90 + Math.random() * 120;
          ball.trail.length = 0;
        }
      } else {
        newPass();
      }

      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-0 ${INTENSITY[intensity].opacity}`}
    />
  );
}
