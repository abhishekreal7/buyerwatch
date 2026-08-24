'use client'

import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import { Plus } from 'lucide-react'
import { springs } from '@/lib/motion'
import { NewsletterForm } from '@/components/NewsletterForm'
import { PremiumCtaButton } from '@/components/landing/PremiumCtaButton'
import { BrandLogo } from '@/components/BrandLogo'

const faqs = [
  { q: 'What is BuyerWatch?', a: 'It monitors Reddit and Bluesky for people looking for solutions like yours, scores their intent, and drafts a reply for review.' },
  { q: 'Does BuyerWatch post automatically?', a: 'Manual review is the default. Paid accounts can explicitly enable guarded auto-send only after completing the required trust-building reviews.' },
  { q: 'Does it work for non-SaaS businesses?', a: 'Yes. You can monitor configured Reddit communities and Bluesky searches for conversations relevant to any product or service.' },
  { q: 'How is this different from Google Alerts?', a: 'Google Alerts finds mentions of your brand. BuyerWatch finds active buying intent from people who don\'t know you yet.' },
  { q: 'How does intent scoring work?', a: 'We classify posts into Buying, Researching, Complaining, and Other, then attach a 0–100 confidence score for review.' },
  { q: 'What does the Starter plan include?', a: 'Monthly Starter is $39/month after a 7-day full-access trial. Annual Starter is billed $372 upfront. Both include 5 keyword rules, up to 250 conversations per month, and manual review before anything is posted.' },
  { q: 'Does this violate platform terms of service?', a: 'BuyerWatch uses public-feed access and authenticated connections where configured. Manual review is the default, and you remain responsible for each platform\'s rules.' },
  { q: 'How does BuyerWatch reduce promotional replies?', a: 'Drafts include an affiliation disclosure, are checked for promotional phrasing, and stay in manual review until the confidence engine has enough trust evidence.' }
]

const fadeUp = {
  hidden: { opacity: 1, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
}

function Section({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-20px' })
  return (
    <motion.section ref={ref} id={id} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }} initial="hidden" animate={inView ? 'show' : 'hidden'} className={className}>
      {children}
    </motion.section>
  )
}

export function LandingFooter() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  return (
    <>
        {/* ━ ━ ━ ━  section separator: FAQ ━ ━ ━ ━  */}
        <Section id="faq" className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[680px] mx-auto px-[24px]">
            <motion.div variants={fadeUp} className="text-center mb-[52px]">
              <h2 style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A', marginBottom: '10px' }}>
                Common questions
              </h2>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: '16px', color: '#6B6B6B', lineHeight: 1.6 }}>
                Everything you need to know about BuyerWatch
              </p>
            </motion.div>

            <div className="flex flex-col">
              {faqs.map((faq, i) => (
                <motion.div key={i} variants={fadeUp} className="border-b border-black/[0.08] overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full text-left py-5 flex items-center justify-between gap-4"
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-trigger-${i}`}
                  >
                    <span style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 600, fontSize: '16px', letterSpacing: '-0.02em', color: '#0A0A0A' }}>{faq.q}</span>
                    <motion.div
                      animate={{ rotate: openFaq === i ? 45 : 0 }}
                      transition={springs.snappy}
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-black/[0.06] flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3 text-[#0A0A0A]" strokeWidth={2.5} />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        id={`faq-panel-${i}`}
                        role="region"
                        aria-labelledby={`faq-trigger-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '15px', color: '#6B6B6B', lineHeight: 1.65, paddingBottom: '20px' }}>
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: FOOTER CTA ━ ━ ━ ━  */}
        <Section className="bg-white pt-[100px] pb-[100px]">
          <div className="max-w-[640px] mx-auto px-[24px] text-center">
            <motion.h2 variants={fadeUp} className="mb-4"
              style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif', fontWeight: 800, fontSize: 'clamp(34px, 4vw, 52px)', letterSpacing: '-0.04em', lineHeight: 1.05, color: '#0A0A0A' }}>
              See the right conversation.<br />Decide what happens next.
            </motion.h2>
            <motion.p variants={fadeUp} className="mb-10" style={{ fontFamily: 'var(--font-inter)', fontSize: '17px', color: '#6B6B6B', lineHeight: 1.65 }}>
              Start monitoring Reddit and Bluesky with 5 keyword rules on Starter.
            </motion.p>
            <motion.div variants={fadeUp} className="flex items-center justify-center">
              <PremiumCtaButton href="/signup" className="w-full sm:w-auto">
                Get started
              </PremiumCtaButton>
            </motion.div>
          </div>
        </Section>

        {/* ━ ━ ━ ━  section separator: FOOTER ━ ━ ━ ━  */}
        <footer className="bg-[#0A0A0A] text-white py-20 px-6">
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-1">
              <div className="mb-4">
                <BrandLogo size="sm" tone="light" />
              </div>
              <p style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>
                Find your customers where they're already talking.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-8 md:col-span-2">
              {[
                {
                  label: 'Product',
                  links: [
                    { name: 'Features', href: '/#features' },
                    { name: 'Pricing', href: '/#pricing' },
                    { name: 'How it Works', href: '/#how-it-works' },
                  ],
                },
                {
                  label: 'Company',
                  links: [
                    { name: 'About', href: '/about' },
                    { name: 'Contact', href: '/contact' },
                  ],
                },
                {
                  label: 'Legal',
                  links: [
                    { name: 'Privacy', href: '/privacy' },
                    { name: 'Terms', href: '/terms' },
                  ],
                },
              ].map(({ label, links }) => (
                <div key={label}>
                  <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div className="flex flex-col gap-3">
                    {links.map(({ name, href }) => (
                      <a key={name} href={href} style={{ fontFamily: 'var(--font-inter)', fontSize: '14px', color: 'rgba(255,255,255,0.38)' }} className="hover:text-white transition-colors duration-150">{name}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="md:col-span-1">
              <div style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stay in the loop</div>
              <NewsletterForm />
            </div>
          </div>
          <div className="max-w-[1200px] mx-auto border-t border-white/[0.07] pt-7 flex items-center justify-between">
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: 'rgba(255,255,255,0.25)' }}>© 2026 BuyerWatch. All rights reserved.</div>
          </div>
        </footer>
    </>
  )
}
