import { forwardRef } from 'react'

interface Props {
  id: string
  children: React.ReactNode
  tone?: 'light' | 'tint'
}

/** Consistent vertical rhythm + scroll anchor for each major section. */
export const Section = forwardRef<HTMLElement, Props>(function Section(
  { id, children, tone = 'light' },
  ref,
) {
  return (
    <section
      ref={ref}
      id={id}
      className={`scroll-mt-20 py-16 sm:py-20 ${
        tone === 'tint' ? 'bg-white/50 border-y border-sand-100' : ''
      }`}
    >
      {children}
    </section>
  )
})
