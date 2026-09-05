'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { BlueskyIcon, RedditIcon, XIcon } from '@/components/Icons'
import styles from './landing.module.css'

const signals = [
  { platform: 'Reddit', source: 'r/SaaS', title: 'Looking for a better way to find buyer intent', score: 94, icon: <RedditIcon className={styles.platformIcon} /> },
  { platform: 'Bluesky', source: 'bsky.social', title: 'Which social listening tool catches real demand?', score: 88, icon: <BlueskyIcon className={styles.platformIcon} /> },
  { platform: 'X', source: 'Live post', title: 'Need recommendations before we choose a platform', score: 91, icon: <XIcon className={styles.platformIcon} /> },
]

export function HeroSection() {
  return (
    <section id="hero" className={styles.hero}>
      <div className={styles.heroGlow} />
      <motion.div className={styles.heroCopy} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
        <div className={styles.kicker}><span className={styles.kickerDot} /><Sparkles size={14} /> Stop waiting for inbound leads</div>
        <h1><span>Find buyer intent</span><span>while it’s still active.</span></h1>
        <p>BuyerWatch monitors the communities where your buyers talk, qualifies intent, and prepares relevant replies while the conversation is still active.</p>
        <div className={styles.heroActions}><Link href="/signup" className={styles.primaryButton}>Start monitoring <ArrowUpRight size={18} /></Link><a href="#how-it-works" className={styles.secondaryButton}>See how it works</a></div>
        <div className={styles.platformPills} aria-label="Supported platforms"><span className={styles.redditPill}><RedditIcon className={styles.platformIcon} /> Reddit</span><span><BlueskyIcon className={styles.platformIcon} /> Bluesky</span><span className={styles.xPill}><XIcon className={styles.platformIcon} /> X</span></div>
      </motion.div>
      <div className={styles.radarStage} aria-label="Live signal radar preview">
        <div className={styles.radarHeader}><span><i /> Live signal radar</span><b>Scanning now</b></div><div className={styles.radarGrid} /><div className={styles.radarSweep} />
        <div className={styles.signalDeck}>{signals.map((signal, index) => <motion.article key={signal.platform} className={`${styles.signalCard} ${styles[`signalCard${index + 1}`]}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: .12 * index }}><div className={styles.signalTop}><span>{signal.icon}{signal.platform}</span><b>{signal.score} intent</b></div><small>{signal.source}</small><h3>{signal.title}</h3><div className={styles.signalMeter}><i style={{ width: `${signal.score}%` }} /></div></motion.article>)}</div>
        <div className={styles.confidenceBadge}><span>94</span><small>buyer intent</small></div>
      </div>
    </section>
  )
}
