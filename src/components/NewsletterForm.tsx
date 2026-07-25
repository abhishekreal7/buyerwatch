'use client'

import { FormEvent, useState } from 'react'

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error'

export function NewsletterForm() {
  const [state, setState] = useState<SubmissionState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('submitting')
    setMessage('')

    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          website: form.get('website'),
        }),
      })

      if (!response.ok) {
        throw new Error('subscription_failed')
      }

      event.currentTarget.reset()
      setState('success')
      setMessage('You’re subscribed.')
    } catch {
      setState('error')
      setMessage('Could not subscribe right now. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <label htmlFor="newsletter-email" className="sr-only">Email address</label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="your@email.com"
          className="bg-white/[0.07] border border-white/[0.10] rounded-xl px-4 py-2.5 text-[14px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 w-full transition-colors"
        />
        <input
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="bg-white text-black px-4 py-2.5 rounded-xl text-[13px] font-[700] hover:bg-surface-secondary/90 transition-colors duration-150 whitespace-nowrap disabled:opacity-60"
        >
          {state === 'submitting' ? 'Saving…' : 'Subscribe'}
        </button>
      </div>
      <p
        className={`mt-2 min-h-5 text-xs ${state === 'error' ? 'text-red-300' : 'text-white/60'}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </form>
  )
}
