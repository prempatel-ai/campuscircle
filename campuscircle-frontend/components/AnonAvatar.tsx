"use client";

import React, { useMemo } from "react";

interface AnonAvatarProps {
  username: string;
  size?: number;
  className?: string;
  shape?: "circle" | "square";
}

// 1. Curated palette of background colors that harmonize with green/gold/earthy tones
const BACKGROUND_PALETTE = [
  "#2F5233", // Collegiate Green (Primary)
  "#1C3220", // Deep Forest Green
  "#E8A33D", // Warm Gold (Accent)
  "#C58529", // Ochre/Dark Gold
  "#4E6D53", // Sage/Slate Green
  "#7B9070", // Olive Green
  "#8C5A3C", // Warm Terracotta/Rust
  "#3A504B", // Slate Teal
  "#14171A", // Rich Ink
  "#5D6D7E", // Slate Grey
];

// Curated palette of shape colors for layers
const SHAPE_PALETTE = [
  "#FFFFFF", // Pure White
  "#F5F6F4", // Light Off-white
  "#E8A33D", // Warm Gold
  "#2F5233", // Collegiate Green
  "#B3D4BB", // Soft Mint
  "#F9E79F", // Light Gold
  "#EDBB99", // Warm Apricot
  "#85C1E9", // Sky Blue Accent
  "#A2D9CE", // Pale Teal
];

// Simple FNV-1a like string hashing function
function getHashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Deterministic PRNG using LCG (Linear Congruential Generator)
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  choice<T>(list: T[]): T {
    const index = Math.floor(this.next() * list.length);
    return list[index];
  }
}

// Generate organic blob path smoothly using quadratic bezier curves
function generateBlobPath(rand: SeededRandom, cx: number, cy: number, r: number): string {
  const points: { x: number; y: number }[] = [];
  const numPoints = 5;
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const offsetRadius = r * rand.range(0.75, 1.25);
    points.push({
      x: cx + Math.cos(angle) * offsetRadius,
      y: cy + Math.sin(angle) * offsetRadius,
    });
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < numPoints; i++) {
    const nextIndex = (i + 1) % numPoints;
    const curr = points[i];
    const next = points[nextIndex];
    const xc = (curr.x + next.x) / 2;
    const yc = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y}, ${xc} ${yc}`;
  }
  d += " Z";
  return d;
}

export const AnonAvatar: React.FC<AnonAvatarProps> = ({
  username,
  size = 40,
  className = "",
  shape = "circle",
}) => {
  const svgContent = useMemo(() => {
    const cleanUsername = username.trim();
    const hash = getHashCode(cleanUsername);
    const rand = new SeededRandom(hash);

    // Pick background color
    const bgColor = rand.choice(BACKGROUND_PALETTE);

    // Determine layout style (0: Concentric Circles/Rings, 1: Abstract Polygons, 2: Smooth Organic Blobs, 3: Modernist Grid)
    const layoutStyle = Math.floor(rand.range(0, 4));

    const shapes: React.ReactNode[] = [];

    // Helper to select a color that contrast-checks with background
    const getContrastColor = () => {
      let color = rand.choice(SHAPE_PALETTE);
      // Try to avoid matching shape color directly with background color
      if (color === bgColor) {
        color = SHAPE_PALETTE[(SHAPE_PALETTE.indexOf(color) + 1) % SHAPE_PALETTE.length];
      }
      return color;
    };

    if (layoutStyle === 0) {
      // Style 0: Concentric Circles, Rotating Square, Rings
      const color1 = getContrastColor();
      const color2 = getContrastColor();
      const color3 = getContrastColor();

      const squareRot = rand.range(0, 360);
      const circleR = rand.range(15, 25);
      const strokeW = rand.range(3, 7);

      shapes.push(
        <rect
          key="sq"
          x={30}
          y={30}
          width={40}
          height={40}
          fill={color1}
          opacity={0.3}
          transform={`rotate(${squareRot} 50 50)`}
        />,
        <circle key="c1" cx={50} cy={50} r={circleR} fill={color2} opacity={0.85} />,
        <circle
          key="c2"
          cx={50}
          cy={50}
          r={circleR + 12}
          fill="none"
          stroke={color3}
          strokeWidth={strokeW}
          opacity={0.6}
        />
      );
    } else if (layoutStyle === 1) {
      // Style 1: Abstract Polygons, Diagonal Stripes, Dots
      const color1 = getContrastColor();
      const color2 = getContrastColor();
      const color3 = getContrastColor();

      const stripeAngle = rand.range(-45, 45);
      const stripeW = rand.range(8, 20);
      const polyRotation = rand.range(0, 360);

      shapes.push(
        // Background diagonal strip
        <rect
          key="stripe"
          x={-50}
          y={35}
          width={200}
          height={stripeW}
          fill={color1}
          opacity={0.4}
          transform={`rotate(${stripeAngle} 50 50)`}
        />,
        // Large central triangle
        <polygon
          key="poly"
          points="50,22 24,70 76,70"
          fill={color2}
          opacity={0.8}
          transform={`rotate(${polyRotation} 50 50)`}
        />,
        // Small target dot
        <circle key="target" cx={50} cy={50} r={6} fill={color3} opacity={0.9} />
      );
    } else if (layoutStyle === 2) {
      // Style 2: Smooth Organic Blobs & Decorative Dots
      const color1 = getContrastColor();
      const color2 = getContrastColor();
      const color3 = getContrastColor();

      const blob1Path = generateBlobPath(rand, 48, 48, 24);
      const blob2Path = generateBlobPath(rand, 52, 52, 16);

      shapes.push(
        <path key="blob1" d={blob1Path} fill={color1} opacity={0.65} />,
        <path key="blob2" d={blob2Path} fill={color2} opacity={0.85} />,
        // Little decorative dots
        <circle key="dot1" cx={25} cy={30} r={3} fill={color3} opacity={0.7} />,
        <circle key="dot2" cx={75} cy={65} r={4.5} fill={color3} opacity={0.7} />
      );
    } else {
      // Style 3: Modernist Grid / Matrix
      const color1 = getContrastColor();
      const color2 = getContrastColor();

      const gridSpacing = 16;
      const startOffset = 26;

      // Draw a 3x3 grid of elements (dots, crosses, triangles)
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          const cx = startOffset + x * gridSpacing;
          const cy = startOffset + y * gridSpacing;
          const choice = rand.next();

          if (choice < 0.5) {
            shapes.push(
              <circle
                key={`grid-c-${x}-${y}`}
                cx={cx}
                cy={cy}
                r={choice * 6 + 2}
                fill={color1}
                opacity={0.7}
              />
            );
          } else if (choice < 0.8) {
            const rot = rand.range(0, 180);
            shapes.push(
              <rect
                key={`grid-r-${x}-${y}`}
                x={cx - 4}
                y={cy - 4}
                width={8}
                height={8}
                rx={1}
                fill={color1}
                opacity={0.6}
                transform={`rotate(${rot} ${cx} ${cy})`}
              />
            );
          }
        }
      }

      // Overlapping main circle
      shapes.push(
        <circle key="main-overlay" cx={50} cy={50} r={18} fill={color2} opacity={0.8} />
      );
    }

    return { bgColor, shapes };
  }, [username]);

  const borderRadius = shape === "circle" ? "rounded-full" : "rounded-xl";

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden select-none shrink-0 ${borderRadius} ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: svgContent.bgColor,
      }}
      suppressHydrationWarning
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        suppressHydrationWarning
      >
        {svgContent.shapes}
      </svg>
    </div>
  );
};
