'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { PRICING_PLANS } from '@/lib/pricing-plans'
import { isStarterPromotionActive, STARTER_PROMOTION } from '@/lib/starter-promotion'
import styles from './landing.module.css'

const planLabels: Record<(typeof PRICING_PLANS)[number]['id'], string> = {
  starter: 'For getting signal live',
  pro: 'For active founders',
  growth: 'For growing teams',
}

export function PricingSection() {
  const [annual, setAnnual] = useState(false)
  const promotionActive = isStarterPromotionActive()
  return <section id="pricing" className={styles.pricingSection}><div className={styles.pricingHeader}><div><span>Simple, honest pricing</span><h2>Choose the monitoring capacity your workflow needs.</h2></div><div className={styles.billingToggle}><span className={!annual ? styles.billingActive : ''}>Monthly</span><button type="button" role="switch" aria-checked={annual} onClick={() => setAnnual(value => !value)}><i /></button><span className={annual ? styles.billingActive : ''}>Annual</span><b>Save 20%+</b></div></div><div className={styles.pricingGrid}>{PRICING_PLANS.map(plan => { const starterOffer = plan.id === 'starter' && promotionActive && !annual; const monthlyPrice = Number(plan.price.replace(/[$,]/g, '')); const price = annual ? plan.annualPrice : starterOffer ? `$${STARTER_PROMOTION.introductoryMonthlyPriceUsd}` : plan.price; const href = `/signup?plan=${plan.id}&billing=${annual ? 'annual' : 'monthly'}`; const billingNote = plan.id === 'starter' ? annual ? `Card required · 7-day free trial · Then billed ${plan.annualTotal} once per year` : starterOffer ? `Card required · 7-day free trial · Then $${STARTER_PROMOTION.introductoryMonthlyPriceUsd} for the first month, then $${monthlyPrice}/month` : 'Card required · 7-day free trial · Then billed monthly' : annual ? `Billed ${plan.annualTotal} once per year` : 'Billed monthly'; return <article key={plan.id} className={plan.highlight ? styles.pricingFeatured : ''}>{starterOffer && <div className={styles.offerBadge}>Limited-time offer</div>}{plan.highlight && <div className={styles.recommendedBadge}>Recommended</div>}<h3>{plan.name}</h3><p>{planLabels[plan.id]}</p><div className={styles.price}>{starterOffer && <del>${monthlyPrice}</del>}<strong>{price}</strong><span>/month</span></div><small>{billingNote}</small><p className={styles.planDescription}>{plan.description}</p><Link href={href}>Choose {plan.name} <ArrowUpRight size={17} /></Link><div className={styles.planDivider} /><b className={styles.includes}>What&apos;s included</b><ul>{plan.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul></article> })}</div></section>
}
