'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { completeOnboardingAction } from '@/app/actions/onboarding'
import { Monitor, ShoppingBag, Briefcase, User, Edit3, MessageSquare, Package, HelpCircle, Plus, X, Search } from 'lucide-react'

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

export default function OnboardingWizard({ plan = 'free' }: { plan?: string }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Form State
  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [businessUrl, setBusinessUrl] = useState('')
  const [businessType, setBusinessType] = useState('saas')

  const [keywords, setKeywords] = useState<{ term: string; platforms: string[] }[]>([
    { term: '', platforms: ['reddit'] }
  ])

  const [redditTargets, setRedditTargets] = useState<string[]>([])
  const [blueskyTargets, setBlueskyTargets] = useState<string[]>([])
  const [xTargets, setXTargets] = useState<string[]>([])
  const [targetInput, setTargetInput] = useState('')
  const [activeTab, setActiveTab] = useState<'reddit' | 'bluesky' | 'x'>('reddit')

  const [writingStyle, setWritingStyle] = useState('')
  const [redditUsername, setRedditUsername] = useState('')

  const handleNext = () => setStep(s => Math.min(4, s + 1))
  const handlePrev = () => setStep(s => Math.max(1, s - 1))

  const handleSubmit = async () => {
    setLoading(true)
    const validTerms = keywords.filter(k => k.term.trim() !== '')
    
    // Construct the rows for the `keywords` table
    const dbKeywords: any[] = []
    for (const k of validTerms) {
      if (k.platforms.includes('reddit')) {
        const targets = redditTargets.length > 0 ? redditTargets : ['all']
        targets.forEach(t => dbKeywords.push({ term: k.term, platform: 'reddit', target: t }))
      }
      if (k.platforms.includes('bluesky')) {
        const targets = blueskyTargets.length > 0 ? blueskyTargets : [k.term]
        targets.forEach(t => dbKeywords.push({ term: k.term, platform: 'bluesky', target: t }))
      }
      if (k.platforms.includes('x') && plan === 'business') {
        const targets = xTargets.length > 0 ? xTargets : [k.term]
        targets.forEach(t => dbKeywords.push({ term: k.term, platform: 'x', target: t }))
      }
    }

    const res = await completeOnboardingAction({
      business_name: businessName,
      business_description: businessDescription,
      business_url: businessUrl,
      business_type: businessType,
      writing_style: writingStyle,
      reddit_username: redditUsername,
      keywords: dbKeywords
    })

    if (res?.error) {
      alert(res.error)
      setLoading(false)
    }
  }

  const addKeyword = () => setKeywords([...keywords, { term: '', platforms: ['reddit'] }])
  const updateKeywordTerm = (index: number, term: string) => {
    const newK = [...keywords]
    newK[index] = { ...newK[index], term }
    setKeywords(newK)
  }
  const toggleKeywordPlatform = (index: number, platform: string) => {
    const newK = [...keywords]
    const p = newK[index].platforms
    if (p.includes(platform)) newK[index].platforms = p.filter(x => x !== platform)
    else newK[index].platforms = [...p, platform]
    setKeywords(newK)
  }
  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index))
  }

  const addTarget = () => {
    if (!targetInput.trim()) return
    if (activeTab === 'reddit' && !redditTargets.includes(targetInput.trim().toLowerCase())) {
      setRedditTargets([...redditTargets, targetInput.trim().toLowerCase()])
    } else if (activeTab === 'bluesky' && !blueskyTargets.includes(targetInput.trim().toLowerCase())) {
      setBlueskyTargets([...blueskyTargets, targetInput.trim().toLowerCase()])
    } else if (activeTab === 'x' && !xTargets.includes(targetInput.trim().toLowerCase())) {
      setXTargets([...xTargets, targetInput.trim().toLowerCase()])
    }
    setTargetInput('')
  }

  const removeTarget = (target: string, platform: 'reddit' | 'bluesky' | 'x') => {
    if (platform === 'reddit') setRedditTargets(redditTargets.filter(t => t !== target))
    if (platform === 'bluesky') setBlueskyTargets(blueskyTargets.filter(t => t !== target))
    if (platform === 'x') setXTargets(xTargets.filter(t => t !== target))
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-center gap-2 mb-12">
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
          transition={{ duration: 0.3, type: 'spring', bounce: 0 }}
          className="glass rounded-2xl p-8 md:p-10 shadow-apple"
        >
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">What's your business?</h2>
                <p className="text-text-secondary text-sm">Tell us what you do so we can find the right conversations.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Business Name</label>
                  <input 
                    value={businessName} onChange={e => setBusinessName(e.target.value)}
                    type="text" placeholder="e.g. Scouto" 
                    className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Business Website</label>
                  <input 
                    value={businessUrl} onChange={e => setBusinessUrl(e.target.value)}
                    type="url" placeholder="https://..." 
                    className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">What do you do?</label>
                  <textarea 
                    value={businessDescription} onChange={e => setBusinessDescription(e.target.value)}
                    placeholder="We make project management software for remote teams..." rows={3}
                    className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Business Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {BUSINESS_TYPES.map(type => (
                      <button
                        key={type.id}
                        onClick={() => setBusinessType(type.id)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${businessType === type.id ? 'bg-[#0A84FF]/10 border-[#0A84FF] text-[#0A84FF]' : 'bg-surface-elevated border-border text-text-secondary hover:border-border-hover'}`}
                      >
                        <type.icon className="w-5 h-5 mb-2" />
                        <span className="text-xs font-medium">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">What should we look for?</h2>
                <p className="text-text-secondary text-sm">Add keywords that signal someone needs your product.</p>
              </div>

              <div className="space-y-4">
                {keywords.map((kw, i) => (
                  <div key={i} className="flex flex-col gap-2 p-4 bg-black/20 border border-border rounded-xl">
                    <div className="flex gap-3">
                      <input 
                        value={kw.term} onChange={e => updateKeywordTerm(i, e.target.value)}
                        type="text" placeholder="e.g. looking for email marketing tool" 
                        className="flex-1 bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors"
                      />
                      {keywords.length > 1 && (
                        <button onClick={() => removeKeyword(i)} className="p-3 text-text-tertiary hover:text-[#FF453A] transition-colors rounded-xl border border-transparent hover:bg-black/5">
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button 
                        onClick={() => toggleKeywordPlatform(i, 'reddit')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${kw.platforms.includes('reddit') ? 'bg-[#0A84FF]/10 border-[#0A84FF] text-[#0A84FF]' : 'border-border text-text-secondary hover:border-border-hover'}`}
                      >Reddit</button>
                      <button 
                        onClick={() => toggleKeywordPlatform(i, 'bluesky')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${kw.platforms.includes('bluesky') ? 'bg-[#0A84FF]/10 border-[#0A84FF] text-[#0A84FF]' : 'border-border text-text-secondary hover:border-border-hover'}`}
                      >Bluesky</button>
                      <button 
                        disabled={plan !== 'business'}
                        onClick={() => toggleKeywordPlatform(i, 'x')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${kw.platforms.includes('x') ? 'bg-[#0A84FF]/10 border-[#0A84FF] text-[#0A84FF]' : 'border-border text-text-secondary hover:border-border-hover'} ${plan !== 'business' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={plan !== 'business' ? 'Requires Business plan' : ''}
                      >
                        X (Twitter) {plan !== 'business' && '🔒'}
                      </button>
                      <button disabled className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-tertiary opacity-50 cursor-not-allowed">Threads (Coming Soon)</button>
                    </div>
                  </div>
                ))}
                
                {keywords.length < 5 && (
                  <button onClick={addKeyword} className="flex items-center gap-2 text-sm text-[#0A84FF] font-medium hover:opacity-80 transition-opacity">
                    <Plus className="w-4 h-4" /> Add another keyword
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
              <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Where to look?</h2>
                <p className="text-text-secondary text-sm">Define specific subreddits or search queries. Leave empty to monitor broadly.</p>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4 border-b border-border pb-2">
                  <button 
                    onClick={() => setActiveTab('reddit')}
                    className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'reddit' ? 'border-[#0A84FF] text-[#0A84FF]' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
                  >Reddit Targets</button>
                  <button 
                    onClick={() => setActiveTab('bluesky')}
                    className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'bluesky' ? 'border-[#0A84FF] text-[#0A84FF]' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
                  >Bluesky Targets</button>
                  <button 
                    disabled={plan !== 'business'}
                    onClick={() => setActiveTab('x')}
                    className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'x' ? 'border-[#0A84FF] text-[#0A84FF]' : 'border-transparent text-text-secondary hover:text-text-primary'} ${plan !== 'business' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    X Targets {plan !== 'business' && '🔒'}
                  </button>
                </div>

                {activeTab === 'x' && (
                  <div className="bg-[#0A84FF]/10 text-[#0A84FF] px-4 py-3 rounded-xl text-sm mb-4">
                    <strong>Note:</strong> X monitoring has a daily cost cap — heavy discovery keywords may be throttled once your plan's daily limit is reached.
                  </div>
                )}

                <div className="flex gap-3 mt-4">
                  <div className="relative flex-1">
                    <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input 
                      value={targetInput} 
                      onChange={e => setTargetInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTarget()}
                      type="text" 
                      placeholder={activeTab === 'reddit' ? "e.g. startups (no 'r/')" : "e.g. email marketing software"} 
                      className="w-full bg-surface-elevated border border-border rounded-xl pl-12 pr-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors"
                    />
                  </div>
                  <button onClick={addTarget} className="bg-surface-elevated border border-border text-text-primary px-6 py-3 rounded-xl hover:bg-black/5 transition-colors font-medium">
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 min-h-[60px]">
                  {activeTab === 'reddit' ? (
                    <>
                      {redditTargets.map(sub => (
                        <div key={sub} className="flex items-center gap-2 bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/20 px-3 py-1.5 rounded-lg text-sm font-medium">
                          r/{sub}
                          <button onClick={() => removeTarget(sub, 'reddit')} className="hover:text-text-primary transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {redditTargets.length === 0 && (
                        <span className="text-text-tertiary text-sm italic py-2">Monitoring all of Reddit...</span>
                      )}
                    </>
                  ) : activeTab === 'bluesky' ? (
                    <>
                      {blueskyTargets.map(query => (
                        <div key={query} className="flex items-center gap-2 bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/20 px-3 py-1.5 rounded-lg text-sm font-medium">
                          "{query}"
                          <button onClick={() => removeTarget(query, 'bluesky')} className="hover:text-text-primary transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {blueskyTargets.length === 0 && (
                        <span className="text-text-tertiary text-sm italic py-2">Will use your keywords as search queries...</span>
                      )}
                    </>
                  ) : (
                    <>
                      {xTargets.map(query => (
                        <div key={query} className="flex items-center gap-2 bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/20 px-3 py-1.5 rounded-lg text-sm font-medium">
                          "{query}"
                          <button onClick={() => removeTarget(query, 'x')} className="hover:text-text-primary transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {xTargets.length === 0 && (
                        <span className="text-text-tertiary text-sm italic py-2">Will use your keywords as search queries...</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Help us sound like you</h2>
                <p className="text-text-secondary text-sm">Describe your communication style so drafts feel authentic.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Writing Style</label>
                  <textarea 
                    value={writingStyle} onChange={e => setWritingStyle(e.target.value)}
                    placeholder="I'm casual and direct. I like to lead with value before mentioning my product. I never sound salesy. I use short paragraphs..." rows={4}
                    className="w-full bg-surface-elevated border border-border rounded-xl px-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Reddit Username (optional)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">u/</span>
                    <input 
                      value={redditUsername} onChange={e => setRedditUsername(e.target.value)}
                      type="text" placeholder="username" 
                      className="w-full bg-surface-elevated border border-border rounded-xl pl-9 pr-4 py-3 text-text-primary placeholder-[#48484A] focus:outline-none focus:border-[#0A84FF]/50 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between mt-8">
        {step > 1 ? (
          <button 
            onClick={handlePrev}
            className="text-text-secondary hover:text-text-primary px-6 py-3 font-medium transition-colors"
          >
            Back
          </button>
        ) : <div />}

        {step < 4 ? (
          <button 
            onClick={handleNext}
            disabled={step === 1 && !businessName}
            className="bg-white text-black px-8 py-3 rounded-xl font-medium transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            Continue
          </button>
        ) : (
          <button 
            onClick={handleSubmit}
            disabled={loading || !writingStyle}
            className="bg-[#0A84FF] text-text-primary px-8 py-3 rounded-xl font-medium shadow-[0_0_20px_rgba(10,132,255,0.3)] transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Setting up...
              </>
            ) : 'Start Monitoring →'}
          </button>
        )}
      </div>
    </div>
  )
}
