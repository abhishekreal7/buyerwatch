import { BrainCircuit, RadioTower, ScanSearch, ShieldCheck } from 'lucide-react'
import styles from './landing.module.css'

const cards = [
  [RadioTower, 'Continuous social indexing', 'Monitor configured communities on your plan cadence.'],
  [ScanSearch, 'Rule-based discovery', 'Track the keywords, problems, and buying language that matter.'],
  [BrainCircuit, 'Buyer-intent qualification', 'Score each match using its source evidence and context.'],
  [ShieldCheck, 'Confidence-gated delivery', 'Only eligible replies enter the guarded review and auto-send workflow.'],
] as const

export function TrustTickerSection() {
  return <section className={styles.trustSection} aria-labelledby="system-title"><div className={styles.sectionHeading}><span>The monitoring system</span><h2 id="system-title">Signal, context, and control in one workflow.</h2></div><div className={styles.trustGrid}>{cards.map(([Icon, title, copy], index) => <article key={title}><div className={styles.trustNumber}>0{index + 1}</div><Icon size={25} /><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
}
