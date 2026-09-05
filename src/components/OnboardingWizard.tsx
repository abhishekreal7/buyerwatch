'use client'

import { useState } from 'react'
import { track } from '@vercel/analytics'
import { ArrowRight, Check, LoaderCircle, Plus, ScanSearch, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { completeOnboardingAction } from '@/app/actions/onboarding'
import type { SelectedBillingCadence, SelectedBillingPlan } from '@/lib/billing-selection'
import { getPlanLimits, type PlanTier } from '@/lib/plan-limits'
import { normalizeWebsiteUrl, validateProductContext } from '@/lib/onboarding-validation'

const BUSINESS_TYPES = [
  ['saas', 'SaaS'], ['ecommerce', 'E-commerce'], ['agency', 'Agency'],
  ['freelancer', 'Freelancer'], ['creator', 'Creator'], ['coach', 'Coach or consultant'],
  ['physical_product', 'Physical product'], ['other', 'Other'],
] as const

type Keyword = { term: string; platforms: string[] }
type Suggestions = { subreddits: string[]; buyer: string[]; competitor: string[]; painPoint: string[] }
type AnalysisResult = { businessName: string; description: string }
type SuggestionPayload = {
  source?: string
  businessName?: string
  description?: string
  subreddits?: unknown
  buyerKeywords?: unknown
  competitorKeywords?: unknown
  painPointKeywords?: unknown
  error?: string
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

export default function OnboardingWizard({
  plan,
  selectedPlan,
  selectedBilling,
}: {
  plan: PlanTier
  selectedPlan: SelectedBillingPlan | null
  selectedBilling: SelectedBillingCadence
}) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [openingCheckout, setOpeningCheckout] = useState(false)
  const [analyzingUrl, setAnalyzingUrl] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const keywordLimit = getPlanLimits(plan).keywords

  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [businessUrl, setBusinessUrl] = useState('')
  const [businessType, setBusinessType] = useState('saas')
  const [keywords, setKeywords] = useState<Keyword[]>([{ term: 'alternative to', platforms: ['reddit'] }])
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  const [redditTargets, setRedditTargets] = useState<string[]>(['SaaS'])
  const [targetInput, setTargetInput] = useState('')
  const [writingStyle, setWritingStyle] = useState('Helpful, concise, and direct. Avoid hype and lead with useful context.')
  const [redditUsername, setRedditUsername] = useState('')

  const applyAnalysis = (payload: SuggestionPayload): AnalysisResult => {
    const nextBusinessName = businessName || String(payload.businessName || '')
    const nextDescription = businessDescription || String(payload.description || '')
    const suggestedTargets = stringList(payload.subreddits)
    const buyer = stringList(payload.buyerKeywords)
    const competitor = stringList(payload.competitorKeywords)
    const painPoint = stringList(payload.painPointKeywords)
    const suggestedKeywords = [...buyer, ...competitor, ...painPoint].map(term => ({ term, platforms: ['reddit'] }))

    if (nextBusinessName) setBusinessName(nextBusinessName)
    if (nextDescription) setBusinessDescription(nextDescription)
    if (payload.source === 'ai') {
      if (suggestedTargets.length > 0) setRedditTargets(suggestedTargets)
      if (suggestedKeywords.length > 0) {
        const targetCount = Math.max(1, suggestedTargets.length || redditTargets.length)
        setKeywords(suggestedKeywords.slice(0, Math.max(1, Math.floor(keywordLimit / targetCount))))
      }
    }
    setSuggestions({ subreddits: suggestedTargets, buyer, competitor, painPoint })
    return { businessName: nextBusinessName, description: nextDescription }
  }

  const handleAnalyze = async (): Promise<AnalysisResult | null> => {
    if (!businessUrl.trim()) {
      toast.error('Enter your website URL first.')
      return null
    }
    const normalizedUrl = normalizeWebsiteUrl(businessUrl)
    try {
      const parsedUrl = new URL(normalizedUrl)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol')
    } catch {
      toast.error('Enter a valid website URL.')
      return null
    }

    setBusinessUrl(normalizedUrl)
    setAnalyzingUrl(true)
    setSubmitError('')
    try {
      const response = await fetch('/api/onboarding/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, businessName, businessDescription }),
      })
      const payload = await response.json().catch(() => null) as SuggestionPayload | null
      if (!response.ok || !payload) {
        const message = payload?.error === 'rate_limited'
          ? 'You have analyzed several websites recently. Wait a moment and try again.'
          : payload?.error === 'ai_spend_limit_reached'
            ? 'Automatic website analysis is temporarily at capacity. Add the details manually to continue.'
            : 'We could not analyze that website right now. Check the address or add the details manually.'
        toast.error(message)
        return null
      }
      const result = applyAnalysis(payload)
      track('onboarding_website_analyzed', { source: payload.source === 'ai' ? 'ai' : 'fallback' })
      toast.success('Recommended monitoring setup is ready for review.')
      return result
    } catch (error) {
      console.error('[onboarding] Website analysis failed:', error)
      toast.error('Website analysis is unavailable. Add the details manually to continue.')
      return null
    } finally {
      setAnalyzingUrl(false)
    }
  }

  const continueFromProduct = async () => {
    setSubmitError('')
    let product = { businessName, description: businessDescription }
    if (businessUrl.trim() && !suggestions) product = await handleAnalyze() ?? product
    const error = validateProductContext({ businessName: product.businessName, businessDescription: product.description })
    if (error) {
      setSubmitError(error)
      return
    }
    track('onboarding_product_context_completed', { usedWebsiteAnalysis: Boolean(suggestions || businessUrl.trim()) })
    setStep(2)
  }

  const continueFromSetup = () => {
    setSubmitError('')
    if (!keywords.some(keyword => keyword.term.trim())) {
      setSubmitError('Add at least one phrase to monitor.')
      return
    }
    if (redditTargets.length === 0) {
      setSubmitError('Add at least one Reddit community to monitor.')
      return
    }
    track('onboarding_monitoring_reviewed', {
      phraseCount: keywords.filter(keyword => keyword.term.trim()).length,
      targetCount: redditTargets.length,
    })
    setStep(3)
  }

  const toggleKeyword = (term: string) => setKeywords(current => {
    const exists = current.some(keyword => keyword.term.toLowerCase() === term.toLowerCase())
    return exists
      ? current.filter(keyword => keyword.term.toLowerCase() !== term.toLowerCase())
      : [...current, { term, platforms: ['reddit'] }]
  })

  const toggleTarget = (target: string) => setRedditTargets(current => current.includes(target)
    ? current.filter(item => item !== target)
    : [...current, target])

  const addTarget = () => {
    const clean = targetInput.trim().replace(/^r\//i, '')
    if (!clean) return
    setRedditTargets(current => current.some(target => target.toLowerCase() === clean.toLowerCase()) ? current : [...current, clean])
    setTargetInput('')
  }

  const handleSubmit = async () => {
    setLoading(true)
    setSubmitError('')
    const requestedRules = keywords
      .filter(keyword => keyword.term.trim())
      .flatMap(keyword => redditTargets.map(target => ({ term: keyword.term.trim(), platform: 'reddit', target })))
      .slice(0, keywordLimit)
    try {
      track('onboarding_initial_scan_started', { ruleCount: requestedRules.length })
      const result = await completeOnboardingAction({
        business_name: businessName,
        business_description: businessDescription,
        business_url: normalizeWebsiteUrl(businessUrl),
        business_type: businessType,
        writing_style: writingStyle,
        reddit_username: redditUsername,
        discovery_source: 'prefer_not_to_say',
        keywords: requestedRules,
      }, selectedPlan, selectedBilling)
      if (result?.error) setSubmitError(result.error)
    } catch (error) {
      console.error('[onboarding] Initial scan failed:', error)
      setSubmitError('We could not start monitoring. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const startTrialBeforeSetup = async () => {
    if (openingCheckout) return
    setOpeningCheckout(true)
    setSubmitError('')
    track('checkout_opened', { source: 'onboarding_early', plan: selectedPlan, billing: selectedBilling })
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ plan: selectedPlan, billing: selectedBilling }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) throw new Error(payload?.error || 'checkout_failed')
      window.location.assign(payload.url)
    } catch (error) {
      console.error('[onboarding] Checkout could not be opened', error)
      setSubmitError('Secure checkout could not be opened. Please try again.')
      setOpeningCheckout(false)
    }
  }

  const selectedPhrases = keywords.filter(keyword => keyword.term.trim())
  const activeRuleCount = Math.min(keywordLimit, selectedPhrases.length * Math.max(1, redditTargets.length))
  const suggestedGroups = [
    { label: 'Direct buying intent', values: suggestions?.buyer ?? [] },
    { label: 'Competitor comparisons', values: suggestions?.competitor ?? [] },
    { label: 'Problem discussions', values: suggestions?.painPoint ?? [] },
  ].filter(group => group.values.length > 0)

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-col">
      <div className="mb-6 flex items-center gap-3" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map(item => (
          <div key={item} className="flex flex-1 items-center gap-2">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${step >= item ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-400'}`}>
              {step > item ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : item}
            </span>
            <span className={`hidden text-xs font-medium sm:block ${step >= item ? 'text-gray-900' : 'text-gray-400'}`}>
              {item === 1 ? 'Product' : item === 2 ? 'Monitoring' : 'Initial scan'}
            </span>
            {item < 3 && <span className={`ml-auto h-px flex-1 ${step > item ? 'bg-gray-900' : 'bg-gray-200'}`} aria-hidden="true" />}
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-black/[0.08] bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,0.05)] sm:p-8">
        {step === 1 && (
          <div className="space-y-6">
            <SectionHeading eyebrow="Product context" title="Tell BuyerWatch what you sell">Add your website and we’ll prepare a monitoring setup for your review. You can edit every recommendation before anything starts.</SectionHeading>
            <div className="space-y-4">
              <div>
                <FieldLabel htmlFor="business-url">Website</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <TextInput id="business-url" value={businessUrl} onChange={setBusinessUrl} type="url" placeholder="yourcompany.com" className="flex-1" />
                  <button type="button" onClick={() => void handleAnalyze()} disabled={analyzingUrl || !businessUrl.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-5 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {analyzingUrl ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                    {analyzingUrl ? 'Analyzing website' : 'Analyze website'}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><FieldLabel htmlFor="business-name">Business name</FieldLabel><TextInput id="business-name" value={businessName} onChange={setBusinessName} placeholder="BuyerWatch" /></div>
                <div>
                  <FieldLabel htmlFor="business-type">Business type</FieldLabel>
                  <select id="business-type" value={businessType} onChange={event => setBusinessType(event.target.value)} className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-950 outline-none transition focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/10">
                    {BUSINESS_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="business-description">What problem do you solve?</FieldLabel>
                <textarea id="business-description" value={businessDescription} onChange={event => setBusinessDescription(event.target.value)} rows={4} placeholder="Describe the customer, the problem, and what your product helps them accomplish." className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-950 outline-none transition focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/10" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <SectionHeading eyebrow="Recommended monitoring setup" title="Review what BuyerWatch will monitor">Keep the phrases and communities that match your market. The initial scan uses only the selections shown here.</SectionHeading>
            {suggestedGroups.length > 0 && (
              <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                {suggestedGroups.map(group => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs font-semibold text-gray-700">{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.values.map(term => {
                        const active = keywords.some(keyword => keyword.term.toLowerCase() === term.toLowerCase())
                        return <ChoicePill key={term} active={active} onClick={() => toggleKeyword(term)}>{term}</ChoicePill>
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <CountLabel label="Monitoring phrases" count={selectedPhrases.length} />
              <div className="space-y-2">
                {keywords.map((keyword, index) => (
                  <div key={index} className="flex gap-2">
                    <TextInput value={keyword.term} onChange={value => setKeywords(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, term: value } : item))} ariaLabel={`Monitoring phrase ${index + 1}`} />
                    {keywords.length > 1 && <RemoveButton label={`Remove ${keyword.term || `phrase ${index + 1}`}`} onClick={() => setKeywords(current => current.filter((_, itemIndex) => itemIndex !== index))} />}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setKeywords(current => [...current, { term: '', platforms: ['reddit'] }])} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#0A84FF] hover:text-[#006EDB]"><Plus className="h-3.5 w-3.5" /> Add phrase</button>
            </div>
            <div>
              <CountLabel label="Reddit communities" count={redditTargets.length} />
              {suggestions?.subreddits && suggestions.subreddits.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">{suggestions.subreddits.map(target => <ChoicePill key={target} active={redditTargets.includes(target)} onClick={() => toggleTarget(target)}>r/{target}</ChoicePill>)}</div>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">r/</span><input value={targetInput} onChange={event => setTargetInput(event.target.value)} onKeyDown={event => event.key === 'Enter' && (event.preventDefault(), addTarget())} type="text" placeholder="SaaS" className="min-h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm text-gray-950 outline-none transition focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/10" /></div>
                <button type="button" onClick={addTarget} className="min-h-11 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-100">Add</button>
              </div>
              {redditTargets.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{redditTargets.map(target => <span key={target} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-gray-100 pl-3 pr-1 text-xs font-medium text-gray-700">r/{target}<button type="button" onClick={() => toggleTarget(target)} className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-white hover:text-red-600" aria-label={`Remove r/${target}`}><X className="h-3.5 w-3.5" /></button></span>)}</div>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <SectionHeading eyebrow="Review setup" title="Confirm your monitoring setup">BuyerWatch will begin checking recent public conversations while you complete {selectedPlan === 'starter' ? 'the secure 7-day Starter trial checkout' : 'secure plan checkout'}. Nothing is posted unless your delivery controls and safety checks allow it.</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryMetric label="Rules" value={String(activeRuleCount)} />
              <SummaryMetric label="Communities" value={String(redditTargets.length)} />
              <SummaryMetric label="Delivery" value="Review controls apply" compact />
            </div>
            <div className="space-y-4">
              <div><FieldLabel htmlFor="writing-style">Reply style</FieldLabel><textarea id="writing-style" value={writingStyle} onChange={event => setWritingStyle(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-950 outline-none transition focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/10" /></div>
              <div><FieldLabel htmlFor="reddit-username">Reddit username <span className="font-normal text-gray-400">(optional)</span></FieldLabel><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">u/</span><input id="reddit-username" value={redditUsername} onChange={event => setRedditUsername(event.target.value)} type="text" className="min-h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm text-gray-950 outline-none transition focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/10" /></div></div>
            </div>
            <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm leading-6 text-emerald-950">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <p><span className="font-semibold">You remain in control.</span> BuyerWatch will surface qualified conversations and prepare drafts. Automatic delivery only runs when your plan, connection, limits, and safety checks allow it.</p>
            </div>
          </div>
        )}
      </section>

      {submitError && <p role="alert" aria-live="polite" className="mt-4 text-right text-xs font-medium text-red-600">{submitError}</p>}
      <div className="mt-5 flex items-center justify-between gap-3">
        {step > 1 ? <button type="button" onClick={() => { setSubmitError(''); setStep(current => current - 1) }} className="inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-950">Back</button> : <button type="button" onClick={() => void startTrialBeforeSetup()} disabled={openingCheckout} className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 disabled:opacity-60">{openingCheckout ? 'Opening checkout…' : 'Start trial first'}</button>}
        {step === 1 && <PrimaryButton onClick={() => void continueFromProduct()} disabled={analyzingUrl}>Review monitoring setup <ArrowRight className="h-4 w-4" /></PrimaryButton>}
        {step === 2 && <PrimaryButton onClick={continueFromSetup}>Review initial scan <ArrowRight className="h-4 w-4" /></PrimaryButton>}
        {step === 3 && <button type="button" onClick={() => void handleSubmit()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0A84FF] px-6 text-sm font-semibold text-white transition hover:bg-[#0071E3] disabled:cursor-wait disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}{loading ? 'Preparing secure checkout' : 'Continue to secure checkout'}</button>}
      </div>
    </div>
  )
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#0A84FF]">{eyebrow}</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">{children}</p></div>
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-800">{children}</label>
}

function TextInput({ id, value, onChange, type = 'text', placeholder, className = '', ariaLabel }: { id?: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; className?: string; ariaLabel?: string }) {
  return <input id={id} value={value} onChange={event => onChange(event.target.value)} type={type} inputMode={type === 'url' ? 'url' : undefined} autoCapitalize={type === 'url' ? 'none' : undefined} autoCorrect={type === 'url' ? 'off' : undefined} placeholder={placeholder} aria-label={ariaLabel} className={`min-h-12 min-w-0 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-950 outline-none transition focus:border-[#0A84FF] focus:ring-4 focus:ring-[#0A84FF]/10 ${className}`} />
}

function CountLabel({ label, count }: { label: string; count: number }) {
  return <div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-medium text-gray-800">{label}</span><span className="text-xs text-gray-500">{count} selected</span></div>
}

function ChoicePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>{active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{children}</button>
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-600" aria-label={label}><X className="h-4 w-4" /></button>
}

function SummaryMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium text-gray-500">{label}</p><p className={`mt-1 font-semibold text-gray-950 ${compact ? 'text-sm' : 'text-xl'}`}>{value}</p></div>
}

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-950 px-6 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-60">{children}</button>
}
