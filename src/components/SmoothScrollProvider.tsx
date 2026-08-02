/**
 * SmoothScrollProvider — Lenis smooth wheel scroll for public marketing pages only.
 *
 * Why marketing-only (not root-global):
 * - Dashboard uses nested overflow-y-auto. Window Lenis fights those panes and
 *   makes the app shell feel broken. Marketing pages scroll the document.
 *
 * Why no GSAP:
 * - buyerwatch.com polish is framer-motion whileInView + smooth wheel physics.
 * - Previous GSAP ticker + ScrollTrigger.kill-all on route change broke reveals.
 *
 * Non-obvious options:
 * - autoRaf: Lenis owns its rAF loop (no double-rAF / gsap.ticker coupling).
 * - anchors: hash links (#how-it-works) ease via Lenis instead of hard jumps.
 * - prefers-reduced-motion: skip Lenis entirely → native scroll.
 */
'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

/** Document-scroll marketing surfaces only — never dashboard / app shell. */
function isMarketingPath(pathname: string | null): boolean {
  if (!pathname) return false
  if (pathname === '/') return true
  const marketing = [
    '/pricing',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/signup',
    '/login',
    '/forgot-password',
    '/reset-password',
  ]
  return marketing.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * duration — settle time after wheel input (higher = floatier).
 * easing — deceleration curve.
 * Try: linear (t)=>t | ease-out-quad (t)=>1-(1-t)**2 | expo (default).
 */
const LENIS_DURATION = 1.2
const easeOutExpo = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t))

export default function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isMarketingPath(pathname)) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const lenis = new Lenis({
      duration: LENIS_DURATION,
      easing: easeOutExpo,
      orientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      infinite: false,
      autoRaf: true,
      anchors: { offset: -72, duration: 1.2 },
      // Don't smooth-scroll when the event path hits a nested scroller (modals, etc.).
      prevent: (node) =>
        node.classList?.contains('no-smooth-scroll') ||
        node.closest?.('[data-lenis-prevent]') != null,
    })

    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const target = document.getElementById(id)
      if (target) lenis.scrollTo(target, { offset: -72, immediate: true })
    }

    const handleAnchorClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest<HTMLAnchorElement>('a[href*="#"]')
      if (!anchor) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !url.hash) return
      const section = document.getElementById(decodeURIComponent(url.hash.slice(1)))
      if (!section) return

      event.preventDefault()
      event.stopPropagation()
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
      lenis.scrollTo(section, { offset: -72, duration: 0.7 })
    }

    const frame = window.requestAnimationFrame(scrollToHash)
    window.addEventListener('hashchange', scrollToHash)
    document.addEventListener('click', handleAnchorClick, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', scrollToHash)
      document.removeEventListener('click', handleAnchorClick, true)
      lenis.destroy()
    }
  }, [pathname])

  return <>{children}</>
}
