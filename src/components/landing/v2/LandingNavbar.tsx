'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import styles from './landing.module.css'

const links = [
  ['Home', 'hero'],
  ['How it works', 'how-it-works'],
  ['Why BuyerWatch', 'why-buyerwatch'],
  ['Pricing', 'pricing'],
  ['FAQs', 'faq'],
] as const

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('hero')

  useEffect(() => {
    let animationFrame: number | null = null

    const updateNavigation = () => {
      animationFrame = null
      setScrolled(window.scrollY > 24)
      const current = [...links].reverse().find(([, id]) => {
        const element = document.getElementById(id)
        return element ? element.getBoundingClientRect().top <= 140 : false
      })
      setActive(current?.[1] ?? 'hero')
    }

    const onScroll = () => {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(updateNavigation)
    }

    updateNavigation()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])

  return (
    <header className={`${styles.navShell} ${scrolled ? styles.navScrolled : ''}`}>
      <nav className={styles.nav} aria-label="Main navigation">
        <a href="#hero" className={styles.brandLink} aria-label="BuyerWatch home"><BrandLogo size="md" /></a>
        <div className={styles.desktopLinks}>
          {links.map(([label, id]) => <a key={id} href={`#${id}`} className={active === id ? styles.activeNavLink : ''}>{label}</a>)}
        </div>
        <div className={styles.navActions}>
          <Link href="/login" className={styles.loginLink}>Log in</Link>
          <Link href="/signup" className={styles.navCta}>Start monitoring <span><ArrowUpRight size={15} /></span></Link>
          <button type="button" className={styles.menuButton} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(value => !value)}>
            {open ? <X /> : <Menu />}<span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </nav>
      {open && <div id="mobile-menu" className={styles.mobileMenu} data-lenis-prevent>{links.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{label}</a>)}<Link href="/login">Log in</Link><Link href="/signup" className={styles.mobileCta}>Start monitoring</Link></div>}
    </header>
  )
}
