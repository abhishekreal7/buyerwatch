'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Cog, Crosshair, ShieldCheck } from 'lucide-react'
import styles from './landing.module.css'

const features = [
  { title: 'Monitor the signal', label: 'Automated intent tracking', copy: 'BuyerWatch continuously checks the communities and rules you configure.', image: '/images/landing-v2/workflow-monitor.webp', Icon: Crosshair },
  { title: 'Qualify the moment', label: 'AI lead qualification', copy: 'Every match keeps its source evidence and receives a reviewable intent score.', image: '/images/landing-v2/workflow-qualify.webp', Icon: ShieldCheck },
  { title: 'Prepare the next step', label: 'Task automation', copy: 'Qualified conversations can become brand-aware drafts without losing context.', image: '/images/landing-v2/workflow-draft.webp', Icon: Cog },
] as const

export function AILeadQualificationSection() {
  const [active, setActive] = useState(1)
  const current = features[active]
  return <section id="how-it-works" className={styles.aiSection}><div className={styles.aiIntro}><span>How BuyerWatch works</span><h2>From noisy feeds to a clear next move.</h2><p>BuyerWatch preserves the original conversation from discovery through delivery, so every decision stays explainable.</p></div><div className={styles.aiLayout}><div className={styles.aiVisual}><div className={styles.aiWindowTop}><i /><i /><i /><span>buyerwatch.co</span></div><div className={styles.aiImageFrame}><Image src={current.image} alt="BuyerWatch workflow preview" fill sizes="(max-width: 900px) 90vw, 560px" unoptimized /></div><div className={styles.scoreFloat}><small>AI INTENT SCORE</small><strong>{active === 0 ? 'Live' : active === 1 ? '94' : 'Ready'}</strong><span>{active === 1 ? 'High intent' : current.title}</span></div></div><div className={styles.aiTabs} role="tablist" aria-label="BuyerWatch workflow">{features.map((feature, index) => { const Icon = feature.Icon; return <button key={feature.label} type="button" role="tab" aria-selected={active === index} className={active === index ? styles.aiTabActive : ''} onClick={() => setActive(index)}><span className={styles.aiTabIcon}><Icon /></span><span><small>0{index + 1}</small><b>{feature.label}</b><em>{feature.copy}</em></span></button> })}</div></div></section>
}
