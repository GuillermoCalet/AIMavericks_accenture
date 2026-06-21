import { ExternalLink, PackageX } from 'lucide-react'
import type { ItemContribution, Product } from '@copilot/shared'
import { productImageUrl } from '../services/api'
import { ProductImage } from './ProductImage'

interface Props {
  product: Product
  /** Per-item rationale from the explanation layer (real, grounded). */
  reason?: string
  badge?: string
  featured?: boolean
  /** Real net contribution from the solver (gross − penalties). */
  contribution?: ItemContribution
}

export function ProductCard({ product, reason, badge, featured = false, contribution }: Props) {
  return (
    <article
      className={`card group flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-glow ${
        featured ? 'ring-1 ring-ink/10' : ''
      }`}
    >
      <div className="relative">
        <ProductImage
          sources={[productImageUrl(product.id), product.image]}
          alt={product.title}
          category={product.category}
          className={featured ? 'aspect-[4/5]' : 'aspect-square'}
        />
        {badge && <span className="badge absolute left-3 top-3 bg-ink text-white">{badge}</span>}
        <span className="badge absolute right-3 top-3 bg-white/90 text-ink">{product.category}</span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-sand-500">
              {product.brand}
            </p>
            <h4 className="font-display text-[14px] leading-snug text-ink line-clamp-2">
              {product.title}
            </h4>
          </div>
          <div className="text-right">
            <span className="text-base font-bold text-ink">
              {product.currency}
              {product.price.toFixed(2)}
            </span>
            {product.listPrice && product.listPrice > product.price && (
              <p className="text-xs text-sand-500 line-through">
                {product.currency}
                {product.listPrice.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {product.colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {product.colors.slice(0, 4).map((c) => (
              <span key={c} className="chip py-0.5 text-[11px]">
                {c}
              </span>
            ))}
          </div>
        )}

        {contribution && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-sand-100 pt-2 text-[11px]">
            <span className="badge bg-emerald-50 text-emerald-700">net +{contribution.net.toLocaleString()}</span>
            {contribution.penalty > 0 && (
              <span className="badge bg-sand-100 text-sand-500">−{contribution.penalty.toLocaleString()} pen.</span>
            )}
            {contribution.optional && <span className="badge bg-accent-soft text-accent">optional</span>}
            {contribution.redundant && <span className="badge bg-amber-100 text-amber-700">forced</span>}
          </div>
        )}

        {product.stockStatus !== 'in_stock' && (
          <p className="flex items-center gap-1 text-[11px] text-sand-500">
            <PackageX className="h-3 w-3" /> stock: {product.stockStatus}
            {product.availableSizes ? ` · sizes ${product.availableSizes.join('/')}` : ''}
          </p>
        )}

        {reason && (
          <p className="border-t border-sand-100 pt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
            {reason}
          </p>
        )}

        {product.url && (
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-semibold text-accent hover:underline"
          >
            View source product <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  )
}
