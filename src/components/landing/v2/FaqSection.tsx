'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import styles from './landing.module.css'

const faqs = [
  ['What does BuyerWatch monitor?', 'BuyerWatch monitors configured sources across Reddit and Bluesky. X monitoring is included on Professional and Growth plans.'],
  ['Does BuyerWatch post automatically?', 'Guarded auto-send can publish eligible replies within your plan limits. It uses confidence, policy, connection, and account-trust checks and stops safely when a check fails.'],
  ['Will the replies sound promotional?', 'Drafts use your product context and brand voice, but the user remains responsible for reviewing accuracy, relevance, community rules, and disclosure requirements.'],
  ['How does the Starter offer work?', 'Monthly Starter begins with a card-required 7-day trial and one Instant Autopilot send. While the offer is active, the first paid month is $19, then standard Starter pricing applies. Annual billing uses the published annual total.'],
  ['Can I change plans later?', 'Yes. Billing and access are synchronized with your subscription state, and plan entitlements update when a plan change takes effect.'],
] as const

export function FaqSection() {
  const [open, setOpen] = useState(0)
  return <section id="faq" className={styles.faqSection}><div className={styles.faqIntro}><span>Questions, answered</span><h2>Know exactly what runs before you switch it on.</h2><p>BuyerWatch is designed to make automation understandable, reviewable, and safe to stop.</p></div><div className={styles.faqList}>{faqs.map(([question, answer], index) => <article key={question} className={open === index ? styles.faqOpen : ''}><button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}><span>{question}</span>{open === index ? <Minus /> : <Plus />}</button><div><p>{answer}</p></div></article>)}</div></section>
}
