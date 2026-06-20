import { Check, Sparkles } from 'lucide-react'
import type { Product } from '../data/types'
import { ProductImage } from './ProductImage'

const TAG_STYLES: Record<Product['tag'], string> = {
  'Best match': 'bg-ink text-white',
  'Complements wardrobe': 'bg-accent-soft text-accent',
  'Increases versatility': 'bg-sand-200 text-ink',
  'Reuse from wardrobe': 'bg-emerald-100 text-emerald-700',
  'Trending pick': 'bg-sand-100 text-sand-500',
}

interface Props {
  product: Product
  featured?: boolean
}

export function ProductCard({ product, featured = false }: Props) {
  const isReused = product.source === 'wardrobe'
  return (
    <article
      className={`card group flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-glow ${
        featured ? 'ring-1 ring-ink/10' : ''
      }`}
    >
      <div className="relative">
        <ProductImage
          src={product.image}
          alt={product.name}
          category={product.category}
          className={featured ? 'aspect-[4/5]' : 'aspect-square'}
        />
        <span className={`badge absolute left-3 top-3 ${TAG_STYLES[product.tag]}`}>
          {product.tag === 'Best match' && <Sparkles className="h-3 w-3" />}
          {isReused && <Check className="h-3 w-3" />}
          {product.tag}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sand-500">
              {product.brand}
            </p>
            <h4 className="font-display text-[15px] leading-snug text-ink">{product.name}</h4>
          </div>
          <div className="text-right">
            {isReused ? (
              <span className="text-sm font-bold text-emerald-600">Owned</span>
            ) : (
              <>
                <span className="text-base font-bold text-ink">
                  {product.currency}
                  {product.price}
                </span>
                {product.listPrice && (
                  <p className="text-xs text-sand-500 line-through">
                    {product.currency}
                    {product.listPrice}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {product.colors.map((c) => (
            <span key={c} className="chip py-0.5 text-[11px]">
              {c}
            </span>
          ))}
        </div>

        <p className="border-t border-sand-100 pt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
          {product.reason}
        </p>
      </div>
    </article>
  )
}
