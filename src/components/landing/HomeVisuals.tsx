'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useSpring } from 'framer-motion'
import { FaReddit } from 'react-icons/fa6'

const fadeUp = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0 } }

export const SectionBadge = ({ color, text }: { color: string; text: string }) => (
  <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-surface border border-black/[0.08] rounded-full px-4 py-[6px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] mb-5">
    <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    <span className="text-[13px] font-[500] text-[#0A0A0A] tracking-[-0.01em]">{text}</span>
  </motion.div>
)

// Avatar initials
export const Avatar = ({ initials, color }: { initials: string; color: string }) => (
  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-[700]"
    style={{ background: color, color: '#fff', letterSpacing: '-0.02em' }}>
    {initials}
  </div>
)

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
const RedditSVG = () => <FaReddit className="w-full h-full text-[#FF4500]" />
const BlueskySVG = () => (
  <svg viewBox="0 0 600 530" fill="none" className="w-full h-full">
    <path d="M135.72 44.03C202.216 93.848 273.74 195.17 300 249.49c26.262-54.316 97.782-155.638 164.28-205.46C512.26 8.009 590-19.862 590 68.825c0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.38-3.69-10.832-3.707-7.896-.017-2.936-1.193.516-3.707 7.896-13.714 40.255-67.233 197.356-189.63 71.766-64.444-66.128-34.605-132.256 82.697-152.22-67.108 11.421-142.549-7.449-163.25-81.433C20.156 217.613 10 86.535 10 68.825c0-88.687 77.742-60.816 125.72-24.795z" fill="#0085FF" />
  </svg>
)
export const sourcePlatforms = [
  { name: 'Reddit', sub: 'r/startups + 12,400 more', color: '#FF4500', bg: '#FFF0EB', Icon: RedditSVG, count: '847', textColor: undefined },
  { name: 'Bluesky', sub: '#saas, #buildinpublic', color: '#0085FF', bg: '#EBF4FF', Icon: BlueskySVG, count: '312', textColor: undefined },
]

export const PlatformSourcesWidget = () => {
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Label */}
      <div style={{ fontSize: '11px', fontFamily: 'var(--font-inter)', fontWeight: 600, letterSpacing: '0.08em', color: '#ADADAD', textTransform: 'uppercase', textAlign: 'center' }}>
        Monitors intent signals on
      </div>

      <div className="flex items-center justify-center gap-8 md:gap-12 px-4">
        {/* Reddit */}
        <div className="flex items-center gap-2.5 opacity-75 hover:opacity-100 transition-opacity duration-200">
          <div className="w-6 h-6 flex-shrink-0">
            <RedditSVG />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', fontFamily: 'var(--font-inter)', letterSpacing: '-0.01em' }}>Reddit</span>
        </div>

        <span style={{ color: '#D1D1D1', fontSize: '18px' }}>•</span>

        {/* Bluesky */}
        <div className="flex items-center gap-2.5 opacity-75 hover:opacity-100 transition-opacity duration-200">
          <div className="w-6 h-6 flex-shrink-0">
            <BlueskySVG />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', fontFamily: 'var(--font-inter)', letterSpacing: '-0.01em' }}>Bluesky</span>
        </div>

      </div>
    </div>
  )
}

// ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
export const WordFadeIn = ({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) => {
  const words = text.split(' ')
  return (
    <span className={`inline-block ${className}`}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden mr-[0.3em] pb-[0.1em] -mb-[0.1em]">
          <motion.span
            className="inline-block"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              type: 'spring',
              damping: 24,
              stiffness: 200,
              delay: delay + i * 0.06
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

export const NumberTicker = ({ value, suffix = '' }: { value: number; suffix?: string }) => {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  const spring = useSpring(0, { bounce: 0, duration: 2000 })
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    if (inView) {
      spring.set(value)
    }
  }, [inView, spring, value])

  useEffect(() => {
    return spring.on('change', (latest) => {
      setDisplay(Math.round(latest).toString())
    })
  }, [spring])

  return <span ref={ref}>{display}{suffix}</span>
}

// ── Grovia-Style Infrastructure Section Component ──
const INFRA_QUEUES = [
  { name: 'fetch-reddit',  worker: 'worker-1' },
  { name: 'fetch-bluesky', worker: 'worker-2' },
  { name: 'score-post',    worker: 'worker-3' },
  { name: 'send-reply',    worker: 'worker-4' },
  { name: 'send-digest',   worker: 'worker-5' },
]
export const InfraLiveQueue = () => {
  const [activeIdx, setActiveIdx] = useState(2)
  const [processed, setProcessed] = useState(1247)
  const containerRef = useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { once: false, margin: '-40px' })

  useEffect(() => {
    if (!inView) return
    const qCycle = setInterval(() => setActiveIdx(p => (p + 1) % INFRA_QUEUES.length), 2200)
    const counter = setInterval(() => setProcessed(p => p + Math.floor(Math.random() * 3 + 1)), 3500)
    return () => { clearInterval(qCycle); clearInterval(counter) }
  }, [inView])

  return (
    <div ref={containerRef} className="w-full overflow-hidden rounded-[16px]"
      style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)', background: '#fff', border: '1px solid rgba(0,0,0,0.07)' }}>
      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-3 border-b border-black/[0.06] bg-[#F5F5F5]">
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10.5px', fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Queue</span>
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10.5px', fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: '32px' }}>Worker</span>
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10.5px', fontWeight: 700, color: '#9B9B9B', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Status</span>
      </div>
      {INFRA_QUEUES.map((q, i) => (
        <motion.div
          key={q.name}
          animate={{ backgroundColor: i === activeIdx ? 'rgba(10,132,255,0.032)' : 'rgba(255,255,255,0)' }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="grid grid-cols-[1fr_auto_auto] items-center px-5 border-b border-black/[0.04] last:border-b-0"
          style={{ minHeight: '44px' }}
        >
          {/* Queue name — monospace */}
          <span style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace", fontSize: '12.5px', fontWeight: i === activeIdx ? 600 : 400, color: i === activeIdx ? '#0A0A0A' : '#6B6B6B', letterSpacing: '-0.01em', transition: 'color 0.3s, font-weight 0.3s' }}>
            {q.name}
          </span>
          {/* Worker */}
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '11.5px', color: '#C7C7CC', fontWeight: 500, marginRight: '32px' }}>
            {q.worker}
          </span>
          {/* Status — animated crossfade */}
          <AnimatePresence mode="wait">
            {i === activeIdx ? (
              <motion.span
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-[6px]"
                style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 600, color: '#0A84FF' }}
              >
                <motion.span
                  className="w-[6px] h-[6px] rounded-full bg-[#0A84FF] flex-shrink-0"
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                />
                processing
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-[6px]"
                style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 500, color: '#ADADAD' }}
              >
                <span className="w-[6px] h-[6px] rounded-full bg-[#FF5101] flex-shrink-0 opacity-70" />
                idle
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
      {/* Footer: live counter */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-black/[0.06] bg-[#F0F0F0]">
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 600, color: '#ADADAD', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Total signals processed
        </span>
        <motion.span
          key={processed}
          initial={{ opacity: 0.5, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", fontSize: '13px', fontWeight: 700, color: '#0A0A0A', letterSpacing: '-0.01em' }}
        >
          {processed.toLocaleString()}
        </motion.span>
      </div>
    </div>
  )
}

// ── Card 1: Animated 3D Funnel & Signal Marquee ──
export const PrefilterSignalMarquee = () => {
  return (
    <div className="w-full flex flex-col items-center">
      {/* Centered 3D Glossy Shield / Funnel Icon with Ripple Ring */}
      <div className="relative flex items-center justify-center my-5">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
          className="absolute w-28 h-28 rounded-full bg-[#0A84FF]/20 pointer-events-none"
        />
        <motion.div
          animate={{ y: [-5, 5, -5] }}
          transition={{ repeat: Infinity, duration: 3.6, ease: 'easeInOut' }}
          className="w-22 h-22 rounded-[20px] bg-[#0A84FF] flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.08)] relative z-10"
        >
          <div className="absolute inset-0 rounded-[20px] border border-white/30" />
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative z-10">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </motion.div>
      </div>

      {/* Infinite Horizontal Sliding Signal Marquee */}
      <div className="w-full overflow-hidden relative py-2">
        <motion.div
          animate={{ x: [0, -220] }}
          transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
          className="flex items-center gap-2 whitespace-nowrap"
        >
          {['looking for', 'alternative to', 'switching from', 'recommendations', 'best software', 'looking for', 'alternative to'].map((sig, idx) => (
            <span
              key={idx}
              className="bg-white text-[#1C1C1E] text-[11px] font-semibold px-3 py-1 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-black/[0.04]"
              style={{ fontFamily: 'var(--font-inter)' }}
            >
              "{sig}"
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

// ── Card 2: Animated Live Wave Chart & Redis Feed Window ──
export const CacheLiveWaveChart = () => {
  return (
    <motion.div
      animate={{ y: [-3, 3, -3] }}
      transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
      className="my-3 relative z-10 bg-white rounded-[16px] p-4 border border-black/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-[#C43E00] bg-[#FF5101]/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5101] animate-pulse" /> Live 5m TTL
        </span>
        <span className="text-[11px] font-semibold text-[#0A0A0A] bg-white px-2 py-0.5 rounded-[8px] border border-black/[0.04]">
          +99.4% Hit Rate
        </span>
      </div>

      {/* Animated Wave SVG Graph */}
      <div className="w-full h-14 relative my-2 overflow-hidden rounded-[16px] bg-white/40 p-1">
        <svg className="w-full h-full" viewBox="0 0 200 50" preserveAspectRatio="none">
          <motion.path
            d="M 0 35 Q 40 10, 80 30 T 160 15 T 200 25"
            fill="none"
            stroke="#0A84FF"
            strokeWidth="2.5"
            animate={{ pathLength: [0, 1] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          />
        </svg>
        <motion.div
          animate={{ x: [0, 180, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="w-2.5 h-2.5 rounded-full bg-[#0A84FF] border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] absolute top-4 left-1"
        />
      </div>

      <div className="flex items-center justify-between text-[12px] font-medium text-[#1C1C1E] bg-white/80 rounded-xl p-2 border border-black/[0.04]">
        <span>r/startups &bull; r/saas</span>
        <span className="text-[#0A84FF] font-bold">Cached</span>
      </div>
    </motion.div>
  )
}

// ── Card 3: Pitch Black BUYING / HIGH INTENT Cycler ──
export const IntentTextCycler = () => {
  const words = ['BUYING', 'HIGH INTENT', 'HOT LEAD']
  const colors = ['#FF5101', '#0A84FF', '#FF5101']
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '120px' })

  useEffect(() => {
    if (!inView) return
    const timer = setInterval(() => {
      setIdx((prev) => (prev + 1) % words.length)
    }, 2400)
    return () => clearInterval(timer)
  }, [inView, words.length])

  return (
    <div ref={ref} className="my-auto text-center py-6 h-[110px] flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.92 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center"
        >
          <div
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(38px, 3.8vw, 52px)',
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color: colors[idx],
              textShadow: `0 0 35px ${colors[idx]}80`,
            }}
          >
            {words[idx]}
          </div>
          {/* Glowing Mirror Reflection */}
          <div
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(38px, 3.8vw, 52px)',
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color: colors[idx],
              opacity: 0.18,
              transform: 'scaleY(-1) translateY(10px)',
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1), transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1), transparent)',
            }}
            aria-hidden="true"
          >
            {words[idx]}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Card 5: Smart Retry Alert Stack Cycler ──
