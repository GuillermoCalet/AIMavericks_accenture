import fs from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
import type { Product } from '@copilot/shared'
import { config } from '../config'

// ---------------------------------------------------------------------------
// DuckDB runtime access layer (read side).
// A single shared connection serves product lookups and candidate retrieval.
// ---------------------------------------------------------------------------

let connPromise: Promise<Awaited<ReturnType<DuckDBInstance['connect']>>> | null = null

async function getConnection() {
  if (!connPromise) {
    if (!fs.existsSync(config.catalog.dbPath)) {
      throw new Error(
        `Catalog database not found at ${config.catalog.dbPath}. Run "npm run catalog:import" first.`,
      )
    }
    connPromise = (async () => {
      // Read-only at runtime: the app never writes the catalog (only the import
      // script does). This is correct AND lets multiple processes (e.g. the dev
      // server + a test run) open the same DB concurrently without a lock clash.
      const instance = await DuckDBInstance.create(config.catalog.dbPath, {
        access_mode: 'READ_ONLY',
      })
      return instance.connect()
    })()
  }
  return connPromise
}

/** Escape a string literal for safe inlining (inputs are already validated/typed). */
export function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

function toNumber(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : (v as number)
}

function parseJsonArray(v: unknown): string[] {
  if (typeof v !== 'string' || !v) return []
  try {
    const arr = JSON.parse(v)
    return Array.isArray(arr) ? (arr as string[]) : []
  } catch {
    return []
  }
}

export function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    sourceId: toNumber(row.sourceId),
    brand: String(row.brand ?? ''),
    title: String(row.title ?? ''),
    price: toNumber(row.price),
    listPrice: row.listPrice == null ? null : toNumber(row.listPrice),
    currency: String(row.currency ?? '€'),
    url: String(row.url ?? ''),
    image: String(row.image ?? ''),
    category: String(row.category ?? 'other'),
    subcategory: row.subcategory == null ? null : String(row.subcategory),
    colors: parseJsonArray(row.colors),
    styleTags: parseJsonArray(row.styleTags),
    formality: String(row.formality ?? 'smart-casual') as Product['formality'],
    warmth: String(row.warmth ?? 'medium') as Product['warmth'],
    gender: String(row.gender ?? 'unisex') as Product['gender'],
    available: Boolean(row.available),
    source: 'catalog',
    // Inventory — defaulted to "unknown" when the column is absent (no invented data).
    availableSizes: row.availableSizes ? parseJsonArray(row.availableSizes) : null,
    stockStatus: (String(row.stockStatus ?? 'unknown') as Product['stockStatus']),
    stockQuantity: row.stockQuantity == null ? null : toNumber(row.stockQuantity),
    availabilitySource: String(row.availabilitySource ?? 'catalog-default'),
  }
}

export async function query(sql: string): Promise<Record<string, unknown>[]> {
  const conn = await getConnection()
  const reader = await conn.runAndReadAll(sql)
  return reader.getRowObjects() as Record<string, unknown>[]
}

export async function countProducts(): Promise<number> {
  const rows = await query('SELECT count(*)::INTEGER AS n FROM products')
  return toNumber(rows[0]?.n ?? 0)
}

export async function getProductById(id: string): Promise<Product | null> {
  if (!/^[a-z0-9-]+$/i.test(id)) return null
  const rows = await query(`SELECT * FROM products WHERE id = ${sqlStr(id)} LIMIT 1`)
  return rows.length ? rowToProduct(rows[0]) : null
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const safe = ids.filter((id) => /^[a-z0-9-]+$/i.test(id))
  if (!safe.length) return []
  const list = safe.map(sqlStr).join(', ')
  const rows = await query(`SELECT * FROM products WHERE id IN (${list})`)
  return rows.map(rowToProduct)
}

export interface CategoryQuery {
  category: string
  maxPrice?: number | null
  gender?: 'women' | 'men' | 'unisex' | null
  /** Target formality used to rank relevance inside SQL. */
  targetFormality?: string | null
  /** Preferred colours used to rank relevance inside SQL. */
  preferredColors?: string[]
  limit: number
}

/**
 * Hard-filter retrieval for one category, executed inside DuckDB. The bounded
 * set is ordered by a relevance proxy (formality + preferred-colour matches)
 * rather than price, so quality items survive into the JS preliminary ranking.
 */
export async function queryCategoryCandidates(q: CategoryQuery): Promise<Product[]> {
  const where: string[] = ['available = TRUE', `category = ${sqlStr(q.category)}`]
  if (q.maxPrice != null) where.push(`price <= ${Number(q.maxPrice)}`)
  if (q.gender) where.push(`gender IN (${sqlStr(q.gender)}, ${sqlStr('unisex')})`)

  const relevanceTerms: string[] = []
  if (q.targetFormality) {
    relevanceTerms.push(`(CASE WHEN formality = ${sqlStr(q.targetFormality)} THEN 3 ELSE 0 END)`)
  }
  for (const color of q.preferredColors ?? []) {
    if (/^[a-z]+$/.test(color)) {
      relevanceTerms.push(`(CASE WHEN colors LIKE '%"${color}"%' THEN 2 ELSE 0 END)`)
    }
  }
  const relevance = relevanceTerms.length ? relevanceTerms.join(' + ') : '0'
  const sql =
    `SELECT *, (${relevance}) AS _rel FROM products WHERE ${where.join(' AND ')} ` +
    `ORDER BY _rel DESC, price ASC LIMIT ${Number(q.limit)}`
  const rows = await query(sql)
  return rows.map(rowToProduct)
}
