'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { completeOnboardingAction } from '@/app/actions/onboarding'
import {
  Monitor, ShoppingBag, Briefcase, User, Edit3, MessageSquare, Package,
  HelpCircle, Plus, X, Check, ArrowRight
} from 'lucide-react'
import { springs } from '@/lib/motion'
import { getPlanLimits, type PlanTier } from '@/lib/plan-limits'
import { normalizeWebsiteUrl, validateProductContext } from '@/lib/onboarding-validation'

const BUSINESS_TYPES = [
  { id: 'saas', label: 'SaaS', icon: Monitor },
  { id: 'ecommerce', label: 'E-commerce', icon: ShoppingBag },
  { id: 'agency', label: 'Agency', icon: Briefcase },
  { id: 'freelancer', label: 'Freelancer', icon: User },
  { id: 'creator', label: 'Creator', icon: Edit3 },
  { id: 'coach', label: 'Coach', icon: MessageSquare },
  { id: 'physical_product', label: 'Physical Product', icon: Package },
  { id: 'other', label: 'Other', icon: HelpCircle },
]

export default function OnboardingWizard({ plan }: { plan: PlanTier }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [analyzingUrl, setAnalyzingUrl] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const keywordLimit = getPlanLimits(plan).keywords

  // Form State
  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [businessUrl, setBusinessUrl] = useState('')
  const [businessType, setBusinessType] = useState('saas')

  const [keywords, setKeywords] = useState<{ term: string; platforms: string[] }[]>([
    { term: 'alternative to', platforms: ['reddit'] }
  ])

  const [aiSuggestions, setAiSuggestions] = useState<{
    subreddits: string[];
    buyer: string[];
    competitor: string[];
    painPoint: string[];
  } | null>(null)

  const [redditTargets, setRedditTargets] = useState<string[]>(['SaaS'])
  const blueskyTargets: string[] = []
  const [targetInput, setTargetInput] = useState('')
  const activeTab = 'reddit'

  const [writingStyle, setWritingStyle] = useState('')
  const [redditUsername, setRedditUsername] = useState('')

  const handleNext = () => {
    setSubmitError('')
    if (step === 1) {
      const productError = validateProductContext({ businessName, businessDescription })
      if (productError) {
        setSubmitError(productError)
        return
      }
    }
    if (step === 2 && !keywords.some(keyword => keyword.term.trim())) {
      setSubmitError('Select or add at least one monitoring phrase.')
      return
    }
    if (step === 3 && redditTargets.length === 0) {
      setSubmitError('Select or add at least one community to monitor.')
      return
    }
    setStep(current => Math.min(4, current + 1))
  }
  const handlePrev = () => setStep(s => Math.max(1, s - 1))

  // AI Auto-Analyze URL or Inputs
  const handleAiAnalyze = async () => {
    const trimmedUrl = businessUrl.trim()
    if (!trimmedUrl) return

    const normalizedUrl = normalizeWebsiteUrl(trimmedUrl)
    try {
      const parsedUrl = new URL(normalizedUrl)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol')
    } catch {
      toast.error('Enter a valid website URL.')
      return
    }

    setBusinessUrl(normalizedUrl)
    setAnalyzingUrl(true)
    try {
      const res = await fetch('/api/onboarding/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, businessName, businessDescription })
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        toast.error(data?.error || 'Auto-fill failed. Try again in a moment.')
        return
      }

      if (data.businessName && !businessName) setBusinessName(data.businessName)
      if (data.description && !businessDescription) setBusinessDescription(data.description)
      const suggestedTargets = data.subreddits?.length > 0 ? data.subreddits : redditTargets
      const shouldAutoApplySuggestions = data.source === 'ai'
      if (shouldAutoApplySuggestions && data.subreddits?.length > 0) {
        setRedditTargets(data.subreddits)
      }

      const suggestedKeywords: { term: string; platforms: string[] }[] = []
      if (data.buyerKeywords) data.buyerKeywords.forEach((k: string) => suggestedKeywords.push({ term: k, platforms: ['reddit'] }))
      if (data.competitorKeywords) data.competitorKeywords.forEach((k: string) => suggestedKeywords.push({ term: k, platforms: ['reddit'] }))
      if (data.painPointKeywords) data.painPointKeywords.forEach((k: string) => suggestedKeywords.push({ term: k, platforms: ['reddit'] }))

      if (shouldAutoApplySuggestions && suggestedKeywords.length > 0) {
        const selectedPhraseLimit = Math.max(1, Math.floor(keywordLimit / Math.max(1, suggestedTargets.length)))
        setKeywords(suggestedKeywords.slice(0, selectedPhraseLimit))
      }

      setAiSuggestions({
        subreddits: data.subreddits || [],
        buyer: data.buyerKeywords || [],
        competitor: data.competitorKeywords || [],
        painPoint: data.painPointKeywords || [],
      })
      toast.success(
        data.source === 'ai'
          ? 'Website analyzed. Review the suggested monitoring phrases.'
          : 'Website details added. Suggestions are ready for your review.',
      )
    } catch (err) {
      console.error('[onboarding] AI analyze failed:', err)
      toast.error('Auto-fill failed. Check the URL and try again.')
    } finally {
      setAnalyzingUrl(false)
    }
  }

  const toggleKeywordTerm = (term: string) => {
    const exists = keywords.some(k => k.term.toLowerCase() === term.toLowerCase())
    if (exists) {
      setKeywords(keywords.filter(k => k.term.toLowerCase() !== term.toLowerCase()))
    } else {
      setKeywords([...keywords, { term, platforms: ['reddit'] }])
    }
  }

  const toggleSubreddit = (sub: string) => {
    if (redditTargets.includes(sub)) {
      setRedditTargets(redditTargets.filter(s => s !== sub))
    } else {
      setRedditTargets([...redditTargets, sub])
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setSubmitError('')
    const validTerms = keywords.filter(k => k.term.trim() !== '')

    // Construct the rows for the `keywords` table
    const requestedRules: { term: string; platform: string; target: string }[] = []
    for (const k of validTerms) {
      if (k.platforms.includes('reddit')) {
        const targets = redditTargets.length > 0 ? redditTargets : ['all']
        targets.forEach(t => requestedRules.push({ term: k.term, platform: 'reddit', target: t }))
      }
      if (k.platforms.includes('bluesky')) {
        const targets = blueskyTargets.length > 0 ? blueskyTargets : [k.term]
        targets.forEach(t => requestedRules.push({ term: k.term, platform: 'bluesky', target: t }))
      }
    }
    const dbKeywords = requestedRules.slice(0, keywordLimit)
    const normalizedBusinessUrl = normalizeWebsiteUrl(businessUrl)

    try {
      const res = await completeOnboardingAction({
        business_name: businessName,
        business_description: businessDescription,
        business_url: normalizedBusinessUrl,
        business_type: businessType,
        writing_style: writingStyle,
        reddit_username: redditUsername,
        keywords: dbKeywords
      })

      if (res?.error) {
        setSubmitError(res.error)
      }
    } catch (error) {
      console.error('[onboarding] launch failed:', error)
      setSubmitError('We could not launch monitoring. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const addKeyword = () => setKeywords([...keywords, { term: '', platforms: ['reddit'] }])
  const updateKeywordTerm = (index: number, term: string) => {
    const newK = [...keywords]
    newK[index] = { ...newK[index], term }
    setKeywords(newK)
  }
  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index))
  }

  const addTarget = () => {
    if (!targetInput.trim()) return
    const clean = targetInput.trim().replace(/^r\//, '').toLowerCase()
    if (activeTab === 'reddit' && !redditTargets.includes(clean)) {
      setRedditTargets([...redditTargets, clean])
    }
    setTargetInput('')
  }

  const selectedRuleCount = keywords.filter((keyword) => keyword.term.trim()).length * Math.max(1, redditTargets.length)
  const activeRuleCount = Math.min(keywordLimit, selectedRuleCount)
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[600px] flex-col">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${step >= i ? 'bg-[#0A84FF] w-12' : 'bg-black/10 w-4'}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={springs.smooth}
          className="glass min-h-0 flex-1 overflow-y-visible rounded-2xl border border-border p-5 sm:p-7 md:p-8"
        >
          {/* STEP 1: PRODUCT INFO + INSTANT AI EXTRACT */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-extrabold mb-1.5 tracking-tight text-gray-900">What is your product?</h2>
                <p className="text-text-secondary text-sm">Add your website to extract product context and prepare monitoring suggestions for your review.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Business Name *</label>
                  <input
                    value={businessName} onChange={e => setBusinessName(e.target.value)}
                    type="text" placeholder="e.g. Scouto"
                    className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#8E8E93] focus:outline-none focus:border-[#0A84FF] transition-colors"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-700">Website URL</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={businessUrl} onChange={e => setBusinessUrl(e.target.value)}
                      type="url" inputMode="url" autoCapitalize="none" autoCorrect="off"
                      placeholder="yourproduct.com"
                      className="min-w-0 flex-1 bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#8E8E93] focus:outline-none focus:border-[#0A84FF] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleAiAnalyze}
                      disabled={analyzingUrl || !businessUrl.trim()}
                      aria-busy={analyzingUrl}
                      className="h-[50px] shrink-0 rounded-xl border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-text-secondary disabled:opacity-60 sm:w-auto"
                    >
                      {analyzingUrl ? 'Analyzing...' : 'Analyze website'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">What problem do you solve?</label>
                  <textarea
                    value={businessDescription} onChange={e => setBusinessDescription(e.target.value)}
                    placeholder="e.g. We monitor Reddit for buying intent signals and automatically draft tailored replies for SaaS founders..." rows={3}
                    className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#8E8E93] focus:outline-none focus:border-[#0A84FF] transition-colors resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Category</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {BUSINESS_TYPES.map(type => (
                      <button
                        type="button"
                        key={type.id}
                        onClick={() => setBusinessType(type.id)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer ${businessType === type.id ? 'bg-[#0A84FF]/10 border-[#0A84FF] text-[#0A84FF] font-semibold' : 'bg-surface-elevated border-border text-text-secondary hover:border-border-hover'}`}
                      >
                        <type.icon className="w-4 h-4 mb-1.5" />
                        <span className="text-xs">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: 3-TIER BUYER INTENT KEYWORDS */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold mb-2 tracking-tight text-gray-900">3-Tier Buyer Intent Keywords</h2>
                <p className="text-text-secondary text-sm">Select intent triggers to monitor. Click any phrase to toggle it on/off.</p>
              </div>

              {/* AI Suggested 3-Tier Badges */}
              {aiSuggestions && (
                <div className="space-y-4 p-4 bg-[#0A84FF]/5 border border-[#0A84FF]/15 rounded-2xl">
                  {/* Category 1: Direct Buyer */}
                  {aiSuggestions.buyer.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
                        Direct Buyer Intent
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {aiSuggestions.buyer.map(phrase => {
                          const active = keywords.some(k => k.term.toLowerCase() === phrase.toLowerCase())
                          return (
                            <button
                              type="button"
                              key={phrase}
                              onClick={() => toggleKeywordTerm(phrase)}
                              className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${active ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                            >
                              {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-gray-400" />}
                              "{phrase}"
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Category 2: Competitor mentions */}
                  {aiSuggestions.competitor.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-700">
                        Competitor Replacement Signals
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {aiSuggestions.competitor.map(phrase => {
                          const active = keywords.some(k => k.term.toLowerCase() === phrase.toLowerCase())
                          return (
                            <button
                              type="button"
                              key={phrase}
                              onClick={() => toggleKeywordTerm(phrase)}
                              className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${active ? 'bg-amber-500 text-white border-amber-600 shadow-xs' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                            >
                              {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-gray-400" />}
                              "{phrase}"
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Category 3: Pain Point */}
                  {aiSuggestions.painPoint.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-700">
                        Pain-Point Discussions
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {aiSuggestions.painPoint.map(phrase => {
                          const active = keywords.some(k => k.term.toLowerCase() === phrase.toLowerCase())
                          return (
                            <button
                              type="button"
                              key={phrase}
                              onClick={() => toggleKeywordTerm(phrase)}
                              className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${active ? 'bg-blue-500 text-white border-blue-600 shadow-xs' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
                            >
                              {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-gray-400" />}
                              "{phrase}"
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Active Custom Keyword Input List */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Active Monitoring Phrases ({keywords.length})</label>
                {keywords.map((kw, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={kw.term} onChange={e => updateKeywordTerm(i, e.target.value)}
                      type="text" placeholder="e.g. alternative to competitor"
                      className="flex-1 bg-surface-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-[#8E8E93] focus:outline-none focus:border-[#0A84FF]"
                    />
                    {keywords.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeKeyword(i)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label={`Remove keyword ${kw.term || i + 1}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button type="button" onClick={addKeyword} className="flex min-h-11 items-center gap-1.5 text-xs text-[#0A84FF] font-semibold hover:opacity-80 transition-opacity">
                  <Plus className="w-3.5 h-3.5" /> Add custom phrase
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUBREDDIT TARGETING */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold mb-2 tracking-tight text-gray-900">Target Communities</h2>
                <p className="text-text-secondary text-sm">Choose subreddits to monitor. Click any suggested subreddit to toggle it.</p>
              </div>

              {/* AI Suggested Subreddits */}
              {aiSuggestions?.subreddits && aiSuggestions.subreddits.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">AI Suggested Subreddits</label>
                  <div className="flex flex-wrap gap-2">
                    {aiSuggestions.subreddits.map(sub => {
                      const active = redditTargets.includes(sub)
                      return (
                        <button
                          type="button"
                          key={sub}
                          onClick={() => toggleSubreddit(sub)}
                          className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${active ? 'bg-[#0A84FF] text-white border-[#0A84FF] shadow-xs' : 'bg-surface-elevated text-gray-700 border-border hover:border-gray-300'}`}
                        >
                          r/{sub}
                          {active ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-gray-400" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Add Custom Subreddit */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Add Custom Subreddit</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">r/</span>
                    <input
                      value={targetInput}
                      onChange={e => setTargetInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarget())}
                      type="text"
                      placeholder="marketing"
                      className="w-full bg-surface-elevated border border-border rounded-xl pl-8 pr-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>
                  <button type="button" onClick={addTarget} className="min-h-11 bg-gray-900 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors">
                    Add
                  </button>
                </div>
              </div>

              {/* Selected Subreddits List */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Active Targets ({redditTargets.length})</label>
                <div className="flex flex-wrap gap-2">
                  {redditTargets.map(sub => (
                    <span key={sub} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-800">
                      r/{sub}
                      <button type="button" onClick={() => toggleSubreddit(sub)} className="-mr-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-red-50 hover:text-red-500" aria-label={`Remove r/${sub}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: INSTANT LIVE SIGNAL PREVIEW & CONFIRM */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold mb-2 tracking-tight text-gray-900">Brand Voice & Final Confirmation</h2>
                <p className="text-text-secondary text-sm">Tell us how you want AI drafts to sound, then launch your monitoring pipeline.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Writing Style & Tone</label>
                  <textarea
                    value={writingStyle} onChange={e => setWritingStyle(e.target.value)}
                    placeholder="Direct, helpful, no hype. Lead with genuine value before mentioning our product..." rows={3}
                    className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#8E8E93] focus:outline-none focus:border-[#0A84FF] transition-colors resize-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">Reddit Username (optional)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">u/</span>
                    <input
                      value={redditUsername} onChange={e => setRedditUsername(e.target.value)}
                      type="text" placeholder="username"
                      className="w-full bg-surface-elevated border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>
                </div>

                {/* Instant Signal Summary Card */}
                <div className="p-4 bg-[#0A84FF]/5 border border-[#0A84FF]/20 rounded-2xl space-y-2">
                  <div className="text-xs font-bold text-[#0A84FF] uppercase tracking-wider">
                    Ready to launch
                  </div>
                  <p className="text-xs text-gray-600">
                    Your {planLabel} plan will activate <span className="font-semibold text-gray-900">{activeRuleCount} monitoring {activeRuleCount === 1 ? 'rule' : 'rules'}</span>. High-scoring leads will automatically draft replies and notify you in real time.
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {submitError && (
        <p role="alert" aria-live="polite" className="mt-4 text-right text-xs font-medium text-red-600">
          {submitError}
        </p>
      )}

      {/* Navigation Buttons */}
      <div className="mt-5 flex shrink-0 items-center justify-between gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={handlePrev}
            className="min-h-11 cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-gray-100 hover:text-text-primary sm:px-6"
          >
            Back
          </button>
        ) : <div />}

        {step < 4 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={step === 1 && (!businessName.trim() || businessDescription.trim().length < 12)}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-gray-800 disabled:opacity-50 sm:px-8"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex max-w-sm flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 bg-[#0A84FF] hover:bg-[#0071E3] text-white px-8 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? 'Launching...' : 'Launch monitoring'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
