"use client";

import { useId } from "react";

export default function Logo({ size = 100 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const silverId = `bladeSilver-${uid}`;
  const waveId = `waveAccent-${uid}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size}>
      <defs>
        <linearGradient id={silverId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="50%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id={waveId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#0284C7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0369A1" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      <path
        d="M 50 15 L 75 50 L 50 85 L 25 50 Z"
        fill="none"
        stroke={`url(#${silverId})`}
        strokeWidth="5"
        strokeLinejoin="miter"
      />
      <path d="M 50 15 L 75 50 L 50 85 Z" fill={`url(#${silverId})`} opacity="0.15" />
      <path
        d="M 15 52 C 30 40, 45 62, 50 50 C 55 38, 70 60, 85 48"
        fill="none"
        stroke={`url(#${waveId})`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
