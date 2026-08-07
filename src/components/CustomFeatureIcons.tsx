"use client";

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface CustomIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

// ─── 1. Custom Keyword Rules ──────────────────────────────────────────────────
// Option 2: 3 Delicate Keyword Filter Chips ([+], [-], [✓]) gliding into precision alignment
export function CustomKeywordRulesIcon({ size = 24, color = '#0A0A0A', strokeWidth = 0.9, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Top Filter Chip (+ Target Match) */}
      <motion.g
        animate={{ x: [-2, 2, -2] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
      >
        <rect x="5" y="4" width="14" height="4.5" rx="2" fill="white" stroke={color} strokeWidth={strokeWidth} />
        <line x1="8" y1="5.25" x2="8" y2="7.25" stroke={color} strokeWidth={strokeWidth} />
        <line x1="7" y1="6.25" x2="9" y2="6.25" stroke={color} strokeWidth={strokeWidth} />
        <line x1="11.5" y1="6.25" x2="16" y2="6.25" stroke={color} strokeWidth={strokeWidth} opacity="0.5" />
      </motion.g>

      {/* Middle Filter Chip (- Exclusion Filter) */}
      <motion.g
        animate={{ x: [2, -2, 2] }}
        transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
      >
        <rect x="5" y="10" width="14" height="4.5" rx="2" fill="white" stroke={color} strokeWidth={strokeWidth} />
        <line x1="7" y1="12.25" x2="9" y2="12.25" stroke={color} strokeWidth={strokeWidth} />
        <line x1="11.5" y1="12.25" x2="16" y2="12.25" stroke={color} strokeWidth={strokeWidth} opacity="0.5" />
      </motion.g>

      {/* Bottom Filter Chip (✓ Lead Match) */}
      <motion.g
        animate={{ x: [-1.5, 1.5, -1.5] }}
        transition={{ repeat: Infinity, duration: 3.8, ease: "easeInOut" }}
      >
        <rect x="5" y="16" width="14" height="4.5" rx="2" fill="white" stroke={color} strokeWidth={strokeWidth} />
        <path d="M 7 18.25 L 8 19.25 L 9.5 17.5" stroke={color} strokeWidth={strokeWidth} />
        <line x1="11.5" y1="18.25" x2="16" y2="18.25" stroke={color} strokeWidth={strokeWidth} opacity="0.5" />
      </motion.g>
    </svg>
  );
}

// ─── 2. Tone Matching ────────────────────────────────────────────────────────
// Waveform open C-arc, glowing record dot, and audio equalizer bars pulsing
export function ToneMatchingIcon({ size = 24, color = '#0A0A0A', strokeWidth = 0.9, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Expanded circular C-shaped arc open on the left for visual balance */}
      <motion.path
        d="M 7.0 6.0 A 8.5 8.5 0 1 1 7.0 18.0"
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        style={{ transformOrigin: "13.0px 12px" }}
      />
      {/*
        The pulse only exists in the open side of the waveform.  Keeping it
        hidden while it crosses the equalizer prevents it appearing on top of
        a bar at intermediate animation frames.
      */}
      <motion.circle
        cy="12" r="1.3" fill={color} stroke="white" strokeWidth="1"
        animate={{
          cx: [12.5, 7.4, 4.5, 7.4, 12.5],
          opacity: [0, 0, 1, 0, 0],
          scale: [0, 0, 1.2, 0, 0],
        }}
        transition={{
          repeat: Infinity,
          duration: 3,
          times: [0, 0.2, 0.5, 0.8, 1],
          ease: "easeInOut",
        }}
      />
      {/* Equalizer frequency bars are painted above the pulse as a final visual safeguard. */}
      <motion.line
        x1="9.2" y1="10" x2="9.2" y2="14"
        animate={{ scaleY: [0.5, 1.4, 0.5] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
        style={{ transformOrigin: "9.2px 12px" }}
      />
      <motion.line
        x1="11.7" y1="7.0" x2="11.7" y2="17.0"
        animate={{ scaleY: [0.6, 1.2, 0.6] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        style={{ transformOrigin: "11.7px 12px" }}
      />
      <motion.line
        x1="14.2" y1="8.0" x2="14.2" y2="16.0"
        animate={{ scaleY: [0.4, 1.3, 0.4] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        style={{ transformOrigin: "14.2px 12px" }}
      />
      <motion.line
        x1="16.7" y1="10" x2="16.7" y2="14"
        animate={{ scaleY: [0.5, 1.3, 0.5] }}
        transition={{ repeat: Infinity, duration: 2.0, ease: "easeInOut" }}
        style={{ transformOrigin: "16.7px 12px" }}
      />
    </svg>
  );
}

// ─── 3. Approval Queue ────────────────────────────────────────────────────────
// Double stacked cards sliding in offset queue loop with auto-drawing checkmark
export function ApprovalQueueIcon({ size = 24, color = '#0A0A0A', strokeWidth = 0.9, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Back card (offset bottom-left) */}
      <motion.rect
        x="3.5" y="8.5" width="12" height="12" rx="2.5"
        animate={{ x: [0, 1.5, 0], y: [0, -1.5, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
      />

      {/* Front card group containing the card + circular badge */}
      <motion.g
        animate={{ x: [0, -1.5, 0], y: [0, 1.5, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        style={{ transformOrigin: "14px 9.5px" }}
      >
        {/* Front card */}
        <rect x="8.5" y="3.5" width="12" height="12" rx="2.5" fill="white" />

        {/* Circle checkmark badge in the center of the front card */}
        <circle cx="14.5" cy="9.5" r="3.5" fill="white" />

        {/* Auto-drawing checkmark */}
        <motion.polyline
          points="12.5 9.5 14 11 16.5 8.2"
          animate={{ pathLength: [0, 1, 1, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        />
      </motion.g>
    </svg>
  );
}

// ─── 4. Daily Digest ──────────────────────────────────────────────────────────
// A two-stage hinged flap opens behind the report, then closes over the pocket.
export function DailyDigestIcon({ size = 24, color = '#0A0A0A', strokeWidth = 0.9, style }: CustomIconProps) {
  const [angles, setAngles] = React.useState({ minute: 0, hour: 0 });
  const shouldReduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (shouldReduceMotion) return;
    let rafId: number;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const minute = (elapsed / 3200) * 360;
      const hour = minute / 12;
      setAngles({ minute: minute % 360, hour: hour % 360 });
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [shouldReduceMotion]);

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <defs>
        <clipPath id="digest-card-clip">
          <rect x="2.5" y="0.5" width="19" height="20" rx="2" />
        </clipPath>
      </defs>

      {/* Layer 1: Rear Envelope Back Shell */}
      <rect x="3" y="7" width="18" height="13" rx="2" fill="white" stroke={color} strokeWidth={strokeWidth} />

      <g clipPath="url(#digest-card-clip)">
        {/* Rear-facing triangle rises only after the front flap reaches its hinge. */}
        <motion.path
          d="M 3 7 L 12 7 L 21 7 Z"
          fill="#F7F7F7"
          stroke={color}
          strokeWidth={strokeWidth}
          animate={{
            d: [
              "M 3 7 L 12 7 L 21 7 Z",
              "M 3 7 L 12 7 L 21 7 Z",
              "M 3 7 L 12 0.7 L 21 7 Z",
              "M 3 7 L 12 0.7 L 21 7 Z",
              "M 3 7 L 12 7 L 21 7 Z",
              "M 3 7 L 12 7 L 21 7 Z",
            ],
            opacity: [0, 0, 1, 1, 0, 0],
          }}
          transition={{
            duration: 4.4,
            repeat: Infinity,
            times: [0, 0.27, 0.4, 0.7, 0.84, 1],
            ease: "easeInOut",
          }}
        />

        {/* The report rises only while the rear flap is fully open. */}
        <motion.g
          animate={{
            y: [7, 7, -1.5, -1.5, 7, 7],
            opacity: [0, 0, 1, 1, 0, 0],
          }}
          transition={{
            duration: 4.4,
            repeat: Infinity,
            times: [0, 0.34, 0.47, 0.66, 0.78, 1],
            ease: [0.35, 0, 0.25, 1],
          }}
        >
          {/* Card Body */}
          <rect x="6.5" y="5" width="11" height="10.5" rx="1.5" fill="white" stroke={color} strokeWidth={strokeWidth} />
          {/* Scored Check Badge */}
          <path d="M 9 8 L 10.2 9.2 L 13 6.5" stroke={color} strokeWidth={strokeWidth} />
          {/* Summary Lines */}
          <line x1="8.5" y1="11.5" x2="15.5" y2="11.5" stroke={color} strokeWidth={strokeWidth} />
          <line x1="8.5" y1="13.8" x2="12.5" y2="13.8" stroke={color} strokeWidth={strokeWidth} />
        </motion.g>

        {/* Fixed front pocket masks the report and provides the only closed V seam. */}
        <path
          d="M 3 7 L 12 13.5 L 21 7 V 18 A 2 2 0 0 1 19 20 H 5 A 2 2 0 0 1 3 18 Z"
          fill="white"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <line x1="3" y1="20" x2="9.5" y2="14" stroke={color} strokeWidth={strokeWidth} />
        <line x1="21" y1="20" x2="14.5" y2="14" stroke={color} strokeWidth={strokeWidth} />

        {/* Front-facing triangle folds down from the hinge after the report returns. */}
        <motion.path
          d="M 3 7 L 12 13.5 L 21 7 Z"
          fill="white"
          stroke={color}
          strokeWidth={strokeWidth}
          animate={{
            d: [
              "M 3 7 L 12 13.5 L 21 7 Z",
              "M 3 7 L 12 13.5 L 21 7 Z",
              "M 3 7 L 12 7 L 21 7 Z",
              "M 3 7 L 12 7 L 21 7 Z",
              "M 3 7 L 12 13.5 L 21 7 Z",
              "M 3 7 L 12 13.5 L 21 7 Z",
            ],
            opacity: [1, 1, 0, 0, 1, 1],
          }}
          transition={{
            duration: 4.4,
            repeat: Infinity,
            times: [0, 0.17, 0.3, 0.82, 0.95, 1],
            ease: "easeInOut",
          }}
        />
      </g>

      {/* Ticking clock badge overlay */}
      <circle cx="17.5" cy="16.5" r="3.8" stroke={color} strokeWidth={strokeWidth} fill="white" />
      <line
        x1="17.5" y1="16.5" x2="17.5" y2="14.2"
        strokeWidth={strokeWidth}
        transform={`rotate(${angles.minute}, 17.5, 16.5)`}
      />
      <line
        x1="17.5" y1="16.5" x2="19" y2="16.5"
        strokeWidth={strokeWidth}
        transform={`rotate(${angles.hour}, 17.5, 16.5)`}
      />
    </svg>
  );
}

// ─── 5. Insights Hub ─────────────────────────────────────────────────────────
// Message window speech bubble container + single unbroken trendline arrow path (Zero dot artifacts)
export function InsightsHubIcon({ size = 24, color = '#0A0A0A', strokeWidth = 0.9, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Speech Bubble / Message Window Container */}
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeWidth={strokeWidth} />

      {/* Single continuous trendline arrow path (Zero dot artifacts) */}
      <motion.path
        d="M 7.2 13 L 10.2 10.5 L 12.8 13.1 L 16.5 9.4 M 13.5 9.4 H 16.5 V 12.4"
        stroke={color}
        strokeWidth={strokeWidth}
        animate={{ pathLength: [0, 1, 1, 0] }}
        transition={{
          repeat: Infinity,
          duration: 3.2,
          times: [0, 0.45, 0.8, 1],
          ease: "easeInOut"
        }}
      />
    </svg>
  );
}

// ─── 6. Confidence Engine ───────────────────────────────────────────────────
// Option 2: Precision Target Reticle with 3D AI Diamond Sparkle & radar rings (Raycast Style)
export function ConfidenceEngineIcon({ size = 24, color = '#0A0A0A', strokeWidth = 0.9, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Precision Reticle Corner Brackets */}
      <path d="M 4 7.5 V 5 A 1 1 0 0 1 5 4 H 7.5" stroke={color} strokeWidth={strokeWidth} />
      <path d="M 16.5 4 H 19 A 1 1 0 0 1 20 5 V 7.5" stroke={color} strokeWidth={strokeWidth} />
      <path d="M 20 16.5 V 19 A 1 1 0 0 1 19 20 H 16.5" stroke={color} strokeWidth={strokeWidth} />
      <path d="M 7.5 20 H 5 A 1 1 0 0 1 4 19 V 16.5" stroke={color} strokeWidth={strokeWidth} />

      {/* Pulsing Concentric Radar Target Ring */}
      <motion.circle
        cx="12" cy="12" r="6.8"
        stroke={color} strokeWidth={strokeWidth} opacity="0.3"
        animate={{ scale: [0.7, 1.25, 0.7], opacity: [0.5, 0, 0.5] }}
        transition={{ repeat: Infinity, duration: 2.8, ease: "easeOut" }}
        style={{ transformOrigin: "12px 12px" }}
      />

      {/* Central 3D Rotating AI Sparkle Diamond */}
      <motion.path
        d="M 12 6.5 L 13.5 10.5 L 17.5 12 L 13.5 13.5 L 12 17.5 L 10.5 13.5 L 6.5 12 L 10.5 10.5 Z"
        fill="white"
        stroke={color}
        strokeWidth={strokeWidth}
        animate={{
          scale: [0.9, 1.1, 0.9],
          rotate: [0, 90, 180, 270, 360]
        }}
        transition={{
          scale: { repeat: Infinity, duration: 2.8, ease: "easeInOut" },
          rotate: { repeat: Infinity, duration: 10, ease: "linear" }
        }}
        style={{ transformOrigin: "12px 12px" }}
      />
    </svg>
  );
}
