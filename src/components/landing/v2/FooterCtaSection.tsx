import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import styles from './landing.module.css'

export function FooterCtaSection() {
  return <footer className={styles.footer}><section className={styles.footerCta}><span>Start with the signal</span><h2>Find the conversations already looking for what you sell.</h2><p>Set your monitoring rules, qualify buyer intent, and keep every next step connected to the original conversation.</p><Link href="/signup">Start monitoring <ArrowUpRight /></Link></section><div className={styles.footerBar}><div><BrandLogo size="md" /><p>Social intent monitoring built for accountable outreach.</p></div><nav aria-label="Footer navigation"><Link href="/about">About</Link><Link href="/pricing">Pricing</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/status">Status</Link><Link href="/login">Log in</Link></nav><small>© {new Date().getFullYear()} BuyerWatch. All rights reserved.</small></div></footer>
}
