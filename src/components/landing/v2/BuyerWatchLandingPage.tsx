'use client'

import styles from './landing.module.css'
import { LandingNavbar } from './LandingNavbar'
import { HeroSection } from './HeroSection'
import { AILeadQualificationSection } from './AILeadQualificationSection'
import { GuardedAutoSendSection } from './GuardedAutoSendSection'
import { OperatingRhythmSection } from './OperatingRhythmSection'
import { ComparisonMatrixSection } from './ComparisonMatrixSection'
import { PricingSection } from './PricingSection'
import { FaqSection } from './FaqSection'
import { FooterCtaSection } from './FooterCtaSection'

export function BuyerWatchLandingPage() {
  return (
    <main className={styles.page}>
      <LandingNavbar />
      <HeroSection />
      <AILeadQualificationSection />
      <GuardedAutoSendSection />
      <OperatingRhythmSection />
      <ComparisonMatrixSection />
      <PricingSection />
      <FaqSection />
      <FooterCtaSection />
    </main>
  )
}
