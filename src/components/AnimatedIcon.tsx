'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface AnimatedIconProps {
  icon: React.ComponentType<any>;
  size?: number;
  color?: string;
  strokeWidth?: number;
  duration?: number; // seconds
  delay?: number; // seconds, before the first shape starts
}

export function AnimatedIcon({
  icon: Icon,
  size = 26,
  color = '#0A0A0A',
  strokeWidth = 1.75,
  duration = 0.9,
  delay = 0,
}: AnimatedIconProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(wrapperRef, { once: true, margin: '-40px' });
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (!isInView || hasDrawn || !wrapperRef.current) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const svg = wrapperRef.current.querySelector('svg');
    if (!svg) return;

    const drawables = Array.from(
      svg.querySelectorAll<SVGGeometryElement>('path, line, polyline, polygon, circle, rect, ellipse')
    ).filter((shape) => !shape.hasAttribute('data-no-draw'));

    if (prefersReducedMotion || drawables.length === 0) {
      setHasDrawn(true);
      return;
    }

    // Set initial stroke dash states
    drawables.forEach((shape) => {
      let length = 80;
      try {
        length = shape.getTotalLength() || 80;
      } catch {
        // Safe fallback
      }
      shape.style.strokeDasharray = `${length}`;
      shape.style.strokeDashoffset = `${length}`;
      shape.style.transition = 'none'; // reset transition to prevent snapping during setup
    });

    // Double frame delay or micro-timeout guarantees the browser paints the initial state
    const timer = setTimeout(() => {
      drawables.forEach((shape, i) => {
        let length = 80;
        try {
          length = shape.getTotalLength() || 80;
        } catch {}
        shape.style.transition = `stroke-dashoffset ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay + i * 0.1}s`;
        shape.style.strokeDashoffset = '0';
      });
      setHasDrawn(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [isInView, hasDrawn, duration, delay]);

  return (
    <div ref={wrapperRef} style={{ display: 'inline-flex', lineHeight: 0 }} className="animated-icon-wrapper">
      <Icon size={size} color={color} strokeWidth={strokeWidth} style={{ display: 'block' }} />
    </div>
  );
}

