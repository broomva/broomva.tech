"use client";

import type React from "react";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ThermodynamicGridProps extends React.HTMLAttributes<HTMLDivElement> {
  resolution?: number;
  coolingFactor?: number;
}

const ThermodynamicGrid = ({
  className,
  resolution = 25,
  coolingFactor = 0.98,
  style,
  ...props
}: ThermodynamicGridProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let grid: Float32Array;
    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;

    const mouse = {
      x: -1000,
      y: -1000,
      prevX: -1000,
      prevY: -1000,
      active: false,
    };

    const getThermalColor = (t: number) => {
      // 0.0 = near-black (#0a0a12)
      // 0.3 = deep navy (#001a4d)
      // 0.5 = ai-blue (#0066ff)
      // 0.8 = bright cyan (#33ccff)
      // 1.0 = white-blue (#d0eaff)
      const r = Math.min(255, Math.max(0, t * t * 200));
      const g = Math.min(255, Math.max(0, t * 160 + t * t * 80));
      const b = Math.min(255, Math.max(0, t * 255 + 20));
      return `rgb(${r}, ${g}, ${b})`;
    };

    const resize = () => {
      width = container.offsetWidth;
      height = container.offsetHeight;
      canvas.width = width;
      canvas.height = height;
      cols = Math.ceil(width / resolution);
      rows = Math.ceil(height / resolution);
      grid = new Float32Array(cols * rows).fill(0);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
    };

    let rafId: number;

    const update = () => {
      if (mouse.active) {
        const dx = mouse.x - mouse.prevX;
        const dy = mouse.y - mouse.prevY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(dist / (resolution / 2));

        for (let s = 0; s <= steps; s++) {
          const t = steps > 0 ? s / steps : 0;
          const x = mouse.prevX + dx * t;
          const y = mouse.prevY + dy * t;

          const col = Math.floor(x / resolution);
          const row = Math.floor(y / resolution);

          const radius = 2;
          for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
              const c = col + i;
              const r = row + j;
              if (c >= 0 && c < cols && r >= 0 && r < rows) {
                const idx = c + r * cols;
                const d = Math.sqrt(i * i + j * j);
                if (d <= radius) {
                  grid[idx] = Math.min(1.0, grid[idx] + 0.3 * (1 - d / radius));
                }
              }
            }
          }
        }
      }

      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;

      ctx.fillStyle = "#060810";
      ctx.fillRect(0, 0, width, height);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = c + r * cols;
          const temp = grid[idx];

          grid[idx] *= coolingFactor;

          if (temp > 0.05) {
            const x = c * resolution;
            const y = r * resolution;

            ctx.fillStyle = getThermalColor(temp);

            const size = resolution * (0.8 + temp * 0.5);
            const offset = (resolution - size) / 2;

            ctx.beginPath();
            ctx.rect(x + offset, y + offset, size, size);
            ctx.fill();
          } else {
            if (c % 2 === 0 && r % 2 === 0) {
              const x = c * resolution;
              const y = r * resolution;
              ctx.fillStyle = "#0d1525";
              ctx.fillRect(
                x + resolution / 2 - 1,
                y + resolution / 2 - 1,
                2,
                2,
              );
            }
          }
        }
      }

      rafId = requestAnimationFrame(update);
    };

    window.addEventListener("resize", resize);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    resize();
    update();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [resolution, coolingFactor]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 z-0 overflow-hidden bg-[#060810]",
        className,
      )}
      style={style}
      {...props}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};

export default ThermodynamicGrid;
