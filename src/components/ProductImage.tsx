import { useState } from 'react'
import { ImageIcon } from 'lucide-react'

interface Props {
  src: string
  alt: string
  category: string
  className?: string
}

/**
 * Catalog image with an elegant, on-brand fallback.
 * Real CDN images load when online; if a request fails (e.g. recording the
 * demo offline) we render a tasteful gradient placeholder instead of a broken
 * image, so the prototype always looks finished.
 */
export function ProductImage({ src, alt, category, className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (failed) {
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
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
