"use client";

import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

interface CustomIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

// ─── 1. Custom Keyword Rules ──────────────────────────────────────────────────
// Rules tracks where rule gate nodes slide smoothly along the tracks
export function CustomKeywordRulesIcon({ size = 24, color = '#0A0A0A', strokeWidth = 1.75, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Slider tracks */}
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />

      {/* Sliding rule gates (knobs) with explicit fill/stroke and direct cx animation to prevent track bleed-through */}
      <motion.circle
        cy="6" r="2.2" fill="white" stroke={color} strokeWidth={strokeWidth}
        animate={{ cx: [9, 15, 9] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
      />
      <motion.circle
        cy="12" r="2.2" fill="white" stroke={color} strokeWidth={strokeWidth}
        animate={{ cx: [15, 9, 15] }}
        transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
      />
      <motion.circle
        cy="18" r="2.2" fill="white" stroke={color} strokeWidth={strokeWidth}
        animate={{ cx: [8, 15, 8] }}
        transition={{ repeat: Infinity, duration: 3.8, ease: "easeInOut" }}
      />
    </svg>
  );
}

// ─── 2. Tone Matching ────────────────────────────────────────────────────────
// Waveform open C-arc, glowing record dot, and audio equalizer bars pulsing
export function ToneMatchingIcon({ size = 24, color = '#0A0A0A', strokeWidth = 1.75, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Expanded circular C-shaped arc open on the left for visual balance */}
      <motion.path
        d="M 7.0 6.0 A 8.5 8.5 0 1 1 7.0 18.0"
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        style={{ transformOrigin: "13.0px 12px" }}
      />
      {/* Equalizer frequency bars scaled to the larger C-arc */}
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
      {/* Moving pulse dot rendered on top of the bars */}
      <motion.circle
        cy="12" r="1.5" fill={color} stroke="white" strokeWidth="1.2"
        animate={{
          cx: [11.5, 4, 11.5],
          opacity: [0, 1, 0],
          scale: [0, 1.2, 0]
        }}
        transition={{
          repeat: Infinity,
          duration: 3,
          ease: "easeInOut"
        }}
      />
    </svg>
  );
}

// ─── 3. Approval Queue ────────────────────────────────────────────────────────
// Double stacked cards sliding in offset queue loop with auto-drawing checkmark
export function ApprovalQueueIcon({ size = 24, color = '#0A0A0A', strokeWidth = 1.75, style }: CustomIconProps) {
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
// Split newspaper where text lines type-reveal, with a spinning clock badge overlay
export function DailyDigestIcon({ size = 24, color = '#0A0A0A', strokeWidth = 1.75, style }: CustomIconProps) {
  const [angles, setAngles] = React.useState({ minute: 0, hour: 0 });

  React.useEffect(() => {
    let rafId: number;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      // Minute hand rotates 360 degrees every 6 seconds
      const minute = (elapsed / 6000) * 360;
      // Hour hand rotates 12 times slower
      const hour = minute / 12;
      setAngles({ minute: minute % 360, hour: hour % 360 });
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Newspaper outer border */}
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      {/* Vertical split line */}
      <line x1="12" y1="3.5" x2="12" y2="20.5" />

      {/* Left side text lines typing open */}
      <motion.line
        x1="6.5" y1="7.5" x2="9.5" y2="7.5"
        animate={{ scaleX: [0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        style={{ transformOrigin: "left" }}
      />
      <motion.line
        x1="6.5" y1="11" x2="9.5" y2="11"
        animate={{ scaleX: [0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.4 }}
        style={{ transformOrigin: "left" }}
      />
      <motion.line
        x1="6.5" y1="14.5" x2="9.5" y2="14.5"
        animate={{ scaleX: [0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.8 }}
        style={{ transformOrigin: "left" }}
      />

      {/* Right side text lines typing open */}
      <motion.line
        x1="14.5" y1="7.5" x2="17.5" y2="7.5"
        animate={{ scaleX: [0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.2 }}
        style={{ transformOrigin: "left" }}
      />
      <motion.line
        x1="14.5" y1="11" x2="17.5" y2="11"
        animate={{ scaleX: [0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.6 }}
        style={{ transformOrigin: "left" }}
      />

      {/* Clock badge in bottom-right */}
      <circle cx="17.5" cy="15.5" r="4.5" stroke={color} fill="white" />
      {/* Clock hands: rotating minute and hour hands using native SVG transform attribute */}
      <line
        x1="17.5" y1="15.5" x2="17.5" y2="12.5"
        transform={`rotate(${angles.minute}, 17.5, 15.5)`}
      />
      <line
        x1="17.5" y1="15.5" x2="19.5" y2="15.5"
        transform={`rotate(${angles.hour}, 17.5, 15.5)`}
      />
    </svg>
  );
}

// ─── 5. Insights Hub ─────────────────────────────────────────────────────────
// Chat bubble (static) + 3 bars in bottom zone + self-drawing trendline in upper zone.
// Bars and trendline are separated into distinct vertical zones inside the bubble.
export function InsightsHubIcon({ size = 24, color = '#0A0A0A', strokeWidth = 1.75, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Speech Bubble Container */}
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />

      {/* Crisp Trending Line inside bubble */}
      <motion.path
        d="M7 13l3.5-3.5 2.5 2.5 4.5-4.5"
        animate={{ pathLength: [0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
      />

      {/* Arrowhead */}
      <motion.polyline
        points="14.5 7.5 17.5 7.5 17.5 10.5"
        animate={{ pathLength: [0, 0, 1, 1, 0] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
      />
    </svg>
  );
}



// ─── 6. Data Security ─────────────────────────────────────────────────────────
// Shield lock where shackle locks/unlocks and secure radio waves pulse outward
export function DataSecurityIcon({ size = 24, color = '#0A0A0A', strokeWidth = 1.75, style }: CustomIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {/* Outer pulsing shield ring */}
      <motion.path
        d="M12 5.5 l5.5 2.5 v4 c0 4.2-2.5 6.5-5.5 7.5 c-3-1-5.5-3.3-5.5-7.5 v-4 l5.5-2.5"
        stroke="rgba(0,0,0,0.15)"
        animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0, 0.8] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut" }}
        style={{ transformOrigin: "12px 12px" }}
      />

      {/* Main shield border */}
      <path d="M12 2l8 4v5c0 5.5-3.5 8.5-8 10c-4.5-1.5-8-4.5-8-10V6l8-4z" />

      {/* Lock body */}
      <rect x="9.5" y="11" width="5" height="4" rx="1" fill="white" />

      {/* Locking/unlocking shackle */}
      <motion.path
        d="M10.5 11V9a1.5 1.5 0 0 1 3 0v2"
        animate={{ y: [0, -1.5, 0] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
      />
    </svg>
  );
}
