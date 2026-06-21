import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'

interface Props {
  /** Ordered image sources to try (e.g. local backend image first, then CDN). */
  sources: string[]
  alt: string
  category: string
  className?: string
}

/**
 * Catalog image with ordered fallbacks and an elegant placeholder.
 * The first source is the local backend image (named by product id, so it is
 * guaranteed to be the correct product). If it fails we fall back to the next
 * source (the remote CDN), and finally to a tasteful gradient placeholder — so
 * the recommendation always shows the right picture when available.
 */
export function ProductImage({ sources, alt, category, className = '' }: Props) {
  const list = sources.filter(Boolean)
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)

  // Reset when the product (sources) changes.
  useEffect(() => {
    setIndex(0)
    setLoaded(false)
  }, [list.join('|')])

  const exhausted = index >= list.length

  if (exhausted) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-sand-100 to-sand-200 text-sand-500 ${className}`}
      >
        <ImageIcon className="h-6 w-6 opacity-70" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{category}</span>
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden bg-sand-100 ${className}`}>
      {!loaded && <div className="absolute inset-0 skeleton" />}
      <img
        key={list[index]}
        src={list[index]}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false)
          setIndex((i) => i + 1)
        }}
        className={`h-full w-full object-cover transition-opacity duration-500 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
