'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Puzzle,
  RefreshCw,
  X,
} from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import {
  detectBuyerWatchExtension,
  syncBuyerWatchExtensionSession,
} from '@/lib/extension-client'
import { createClient } from '@/utils/supabase/client'
import type { Session } from '@supabase/supabase-js'

type ExtensionStatus = 'checking' | 'installed' | 'missing'

type ExtensionContextValue = {
  status: ExtensionStatus
  isInstalled: boolean
  openInstall: (reason?: string) => void
  requireExtension: (reason?: string) => boolean
  refreshStatus: () => void
}

const ExtensionContext = createContext<ExtensionContextValue | null>(null)
const EXTENSION_URL = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL || '/buyerwatch-extension.zip'
const IS_STORE_URL = EXTENSION_URL.includes('chromewebstore.google.com')

function hasLegacyExtensionMarker() {
  return document.documentElement.getAttribute('data-buyerwatch-extension') === 'installed'
}

async function publishExtensionSession(session: Session, userId: string) {
  if (await syncBuyerWatchExtensionSession(session, userId)) return
  if (!hasLegacyExtensionMarker() || session.user.id !== userId) return
  window.dispatchEvent(new CustomEvent('buyerwatch:extension-session', {
    detail: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: {
        id: session.user.id,
        email: session.user.email,
      },
    }),
  }))
}

export function ExtensionProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [status, setStatus] = useState<ExtensionStatus>('checking')
  const [modalOpen, setModalOpen] = useState(false)
  const [reason, setReason] = useState('Install the extension to capture Reddit conversations in BuyerWatch.')
  const [supabase] = useState(createClient)

  function refreshStatus() {
    setStatus('checking')
    void (async () => {
      if (await detectBuyerWatchExtension()) {
        setStatus('installed')
        return
      }
      window.dispatchEvent(new Event('buyerwatch:extension-detect'))
      window.setTimeout(() => {
        setStatus(hasLegacyExtensionMarker() ? 'installed' : 'missing')
      }, 350)
    })()
  }

  function openInstall(nextReason?: string) {
    if (nextReason) setReason(nextReason)
    setModalOpen(true)
  }

  function requireExtension(nextReason?: string) {
    if (status === 'installed') return true
    openInstall(nextReason)
    return false
  }

  function closeModal() {
    window.localStorage.setItem(`buyerwatch_extension_prompt_seen:${userId}`, 'true')
    setModalOpen(false)
  }

  useEffect(() => {
    let cancelled = false

    const markInstalled = () => {
      if (cancelled) return
      setStatus('installed')
      setModalOpen(false)
    }

    window.addEventListener('buyerwatch:extension-ready', markInstalled)
    void (async () => {
      if (await detectBuyerWatchExtension()) {
        markInstalled()
        return
      }

      window.dispatchEvent(new Event('buyerwatch:extension-detect'))
      await new Promise(resolve => window.setTimeout(resolve, 350))
      if (hasLegacyExtensionMarker()) {
        markInstalled()
        return
      }
      if (cancelled) return
      setStatus('missing')
      const seen = window.localStorage.getItem(`buyerwatch_extension_prompt_seen:${userId}`) === 'true'
      if (!seen) setModalOpen(true)
    })()

    return () => {
      cancelled = true
      window.removeEventListener('buyerwatch:extension-ready', markInstalled)
    }
  }, [userId])

  useEffect(() => {
    async function syncSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) await publishExtensionSession(session, userId)
    }

    const handleExtensionReady = () => {
      void syncSession()
    }

    window.addEventListener('buyerwatch:extension-ready', handleExtensionReady)
    void syncSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void publishExtensionSession(session, userId)
    })

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('buyerwatch:extension-ready', handleExtensionReady)
    }
  }, [supabase, userId])

  return (
    <ExtensionContext value={{ status, isInstalled: status === 'installed', openInstall, requireExtension, refreshStatus }}>
      {children}
      {modalOpen && (
        <ExtensionInstallModal
          reason={reason}
          status={status}
          onClose={closeModal}
          onRefresh={() => window.location.reload()}
        />
      )}
    </ExtensionContext>
  )
}

export function useExtensionStatus() {
  const value = useContext(ExtensionContext)
  if (!value) throw new Error('useExtensionStatus must be used within ExtensionProvider')
  return value
}

function ExtensionInstallModal({
  reason,
  status,
  onClose,
  onRefresh,
}: {
  reason: string
  status: ExtensionStatus
  onClose: () => void
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyExtensionsUrl() {
    await navigator.clipboard.writeText('chrome://extensions')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-labelledby="extension-install-title">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_28px_80px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between border-b border-[#ECECE8] px-6 py-5">
          <BrandLogo size="sm" />
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-[10px] text-[#777771] transition-colors hover:bg-[#F1F1EE] hover:text-[#1C1C1A]" aria-label="Close extension setup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#EEF6FF] text-[#0A84FF]">
            <Puzzle className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#0A84FF]">Required for Reddit capture</p>
          <h2 id="extension-install-title" className="max-w-[390px] text-[28px] font-bold leading-[1.1] tracking-[-0.035em] text-[#151513]">
            Connect BuyerWatch to Reddit
          </h2>
          <p className="mt-3 max-w-[430px] text-[14px] leading-6 text-[#666660]">{reason}</p>

          <div className="mt-5 rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[12px] leading-5 text-[#52525B]">
            <p><strong className="font-semibold text-[#27272A]">You stay in control.</strong> BuyerWatch captures only Reddit posts you choose, prefills replies for review, and never presses Reddit&apos;s submit button.</p>
            <a href="/privacy" target="_blank" rel="noreferrer" className="mt-1.5 inline-flex min-h-8 items-center font-semibold text-[#0A72E8] hover:underline">
              See exactly what the extension accesses
            </a>
          </div>

          <div className="my-6 space-y-2.5">
            {[
              ['1', IS_STORE_URL ? 'Install from the Chrome Web Store' : 'Download and unzip the extension'],
              ['2', IS_STORE_URL ? 'Pin BuyerWatch in your Chrome toolbar' : 'Open chrome://extensions and choose Load unpacked'],
              ['3', 'Refresh BuyerWatch to confirm the connection'],
            ].map(([number, label]) => (
              <div key={number} className="flex items-center gap-3 rounded-[12px] border border-[#E8E8E4] bg-[#FAFAF8] px-3.5 py-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1C1C1A] text-[11px] font-bold text-white">{number}</span>
                <span className="text-[13px] font-medium text-[#42423E]">{label}</span>
                {number === '2' && !IS_STORE_URL && (
                  <button type="button" onClick={copyExtensionsUrl} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-[#777771] hover:bg-black/5" title="Copy chrome://extensions">
                    {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <a
              href={EXTENSION_URL}
              download={IS_STORE_URL ? undefined : 'buyerwatch-extension.zip'}
              target={IS_STORE_URL ? '_blank' : undefined}
              rel={IS_STORE_URL ? 'noreferrer' : undefined}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#1C1C1A] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black"
            >
              {IS_STORE_URL ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {IS_STORE_URL ? 'Add to Chrome' : 'Download extension'}
            </a>
            <button type="button" onClick={onRefresh} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#DCDCD8] bg-white px-4 text-[13px] font-semibold text-[#343431] transition-colors hover:bg-[#F7F7F4]">
              <RefreshCw className="h-4 w-4" />
              I installed it
            </button>
          </div>

          <button type="button" onClick={onClose} className="mt-4 w-full text-center text-[12px] font-medium text-[#85857F] hover:text-[#444440]">
            I&apos;ll do this later
          </button>
          {status === 'checking' && <span className="sr-only">Checking extension status</span>}
        </div>
      </div>
    </div>
  )
}

export function ExtensionPriorityNotice() {
  const { status, openInstall } = useExtensionStatus()
  if (status !== 'missing') return null

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-[14px] border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 sm:mt-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-amber-950">Reddit capture needs the browser extension</p>
          <p className="mt-0.5 text-[12px] text-amber-800/80">Install it before creating Reddit monitoring rules or capturing opportunities.</p>
        </div>
      </div>
      <button type="button" onClick={() => openInstall()} className="min-h-10 shrink-0 rounded-[10px] bg-amber-950 px-4 text-[12px] font-semibold text-white hover:bg-black sm:ml-auto">
        Set up extension
      </button>
    </div>
  )
}

export function ExtensionSettingsPanel() {
  const { status, openInstall, refreshStatus } = useExtensionStatus()
  const installed = status === 'installed'

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-gray-900">BuyerWatch Browser Extension</h3>
            <p className="mt-1.5 text-[14px] text-[rgba(43,38,33,0.52)]">Capture Reddit conversations and send them to your opportunity queue.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${installed ? 'bg-emerald-50 text-emerald-700' : status === 'checking' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-800'}`}>
            {installed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {installed ? 'Installed' : status === 'checking' ? 'Checking' : 'Action required'}
          </span>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 rounded-[14px] border border-[#E7E7E3] bg-[#FAFAF8] p-4 sm:flex-row sm:items-center">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${installed ? 'bg-emerald-50 text-emerald-600' : 'bg-[#EEF6FF] text-[#0A84FF]'}`}>
            <Puzzle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-[#242421]">{installed ? 'Extension connected' : 'Install the Reddit capture extension'}</p>
            <p className="mt-1 text-[12.5px] leading-5 text-[#71716B]">{installed ? 'BuyerWatch can detect the extension in this browser.' : 'Required to capture Reddit posts when direct API discovery is unavailable.'}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {!installed && <button type="button" onClick={() => openInstall()} className="min-h-10 rounded-[10px] bg-[#1C1C1A] px-4 text-[12px] font-semibold text-white hover:bg-black">Install extension</button>}
            <button type="button" onClick={refreshStatus} className="grid h-10 w-10 place-items-center rounded-[10px] border border-[#DCDCD8] bg-white text-[#62625D] hover:bg-[#F4F4F1]" title="Check extension status" aria-label="Check extension status">
              <RefreshCw className={`h-4 w-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
