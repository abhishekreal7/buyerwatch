'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import styles from './landing.module.css'

const steps = [
  ['01', 'Diagnose', 'Define the communities, keywords, and buying language worth watching.'],
  ['02', 'Uncover', 'Bring qualified conversations into one reviewable opportunity queue.'],
  ['03', 'Compound', 'Learn from posted replies and conversation outcomes over time.'],
] as const

export function OperatingRhythmSection() {
  const [active, setActive] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => setActive(value => (value + 1) % steps.length), 4200); return () => window.clearInterval(timer) }, [])
  return <section className={styles.rhythmSection}><div className={styles.rhythmCopy}><span>Operating rhythm</span><h2>A daily signal loop, not another quarterly report.</h2><div className={styles.rhythmPhoto}><Image src="/images/landing-v2/rhythm-founders.jpg" alt="Team reviewing buyer signals" fill sizes="(max-width: 800px) 90vw, 520px" unoptimized /></div><p>BuyerWatch gives founders a repeatable way to find demand, review context, and respond while the moment still matters.</p></div><div className={styles.dial}><div className={styles.dialOrbit} /><div className={`${styles.stepCard} ${styles[`stepCard${active}`]}`}><small>{steps[active][0]}</small><h3>{steps[active][1]}</h3><p>{steps[active][2]}</p></div><div className={styles.dialControls}>{steps.map((step, index) => <button type="button" key={step[0]} aria-label={`Show ${step[1]}`} aria-pressed={active === index} onClick={() => setActive(index)} className={active === index ? styles.dialActive : ''} />)}</div></div></section>
}
