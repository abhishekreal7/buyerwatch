import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Gauge, LockKeyhole, ShieldCheck } from 'lucide-react'
import styles from './landing.module.css'

const cards = [
  { title: 'Response velocity', metric: 'Always on', copy: 'New qualified matches move into your workflow as soon as monitoring finds them.', image: '/images/landing-v2/velocity-founder.jpg', Icon: Gauge },
  { title: 'Confidence gating', metric: 'Threshold-led', copy: 'Auto-send eligibility follows the score, plan entitlement, account trust, and policy checks.', image: '/images/landing-v2/rhythm-founders.jpg', Icon: LockKeyhole },
  { title: 'Brand safeguards', metric: 'Reviewable', copy: 'Every action keeps its source, outcome, and safety state visible to the user.', image: '/images/landing-v2/safeguards-founder.jpg', Icon: ShieldCheck },
] as const

export function GuardedAutoSendSection() {
  return <section className={styles.guardSection}><div className={styles.guardHeading}><span>Guarded auto-send</span><h2>Move quickly without handing control to a black box.</h2><p>Automation is available within plan limits and stops safely when a required check cannot be confirmed.</p></div><div className={styles.guardGrid}>{cards.map(({ title, metric, copy, image, Icon }, index) => <article key={title} className={index === 1 ? styles.guardTall : ''}><Image src={image} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" unoptimized /><div className={styles.guardOverlay} /><div className={styles.guardContent}><Icon /><small>0{index + 1}</small><strong>{metric}</strong><h3>{title}</h3><p>{copy}</p>{index === 2 && <Link href="/signup">Configure safeguards <ArrowUpRight size={16} /></Link>}</div></article>)}</div></section>
}
