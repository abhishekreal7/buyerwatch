import { Check, X } from 'lucide-react'
import styles from './landing.module.css'

const comparisons = [
  ['Coverage', 'Manual feed-by-feed searching', 'Configured monitoring across supported networks'],
  ['Qualification', 'Judgment from a headline alone', 'Evidence-backed 0–100 buyer-intent scoring'],
  ['Context', 'Links and notes scattered across tools', 'Original conversation attached throughout'],
  ['Delivery', 'Copy, switch tabs, and hope it posted', 'Reviewable drafts with guarded delivery states'],
  ['Outcomes', 'No reliable feedback loop', 'Reply and conversation outcomes in one workspace'],
] as const

export function ComparisonMatrixSection() {
  return <section id="why-buyerwatch" className={styles.comparisonSection}><div className={styles.comparisonIntro}><span>Why BuyerWatch</span><h2>Replace fragmented monitoring with one accountable workflow.</h2></div><div className={styles.matrix}><div className={styles.matrixHead}><span>Capability</span><span>Manual monitoring</span><span>BuyerWatch workflow</span></div>{comparisons.map(([label, manual, buyerwatch]) => <div className={styles.matrixRow} key={label}><b>{label}</b><span><X />{manual}</span><span><Check />{buyerwatch}</span></div>)}</div><div className={styles.truthMetrics}><div><strong>3</strong><span>supported social networks</span></div><div><strong>0–100</strong><span>reviewable intent scale</span></div><div><strong>1</strong><span>source-to-outcome workflow</span></div></div></section>
}
