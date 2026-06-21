/**
 * Reproducible, idempotent catalog import: Data - Copy.csv  ->  DuckDB.
 *
 * - DuckDB streams the CSV itself (we never load all 62k rows into JS at once;
 *   rows are paged in batches and appended).
 * - Prices are normalized, categories/attributes are derived deterministically.
 * - The output DB is rebuilt from scratch each run (idempotent) and indexed.
 * - Reports how many rows were imported vs. discarded.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { config, CURRENCY } from '../src/config'
import { enrichRow, type RawRow, type EnrichedProduct } from '../src/catalog/enrich'

const BATCH_SIZE = 5000

function appendProduct(app: any, e: EnrichedProduct): void {
  app.appendVarchar(e.id)
  app.appendInteger(e.sourceId)
  app.appendVarchar(e.brand)
  app.appendVarchar(e.title)
  app.appendDouble(e.price)
  if (e.listPrice === null) app.appendNull()
  else app.appendDouble(e.listPrice)
  app.appendVarchar(e.currency)
  app.appendVarchar(e.url)
  app.appendVarchar(e.image)
  app.appendVarchar(e.category)
  if (e.subcategory === null) app.appendNull()
  else app.appendVarchar(e.subcategory)
  app.appendVarchar(JSON.stringify(e.colors))
  app.appendVarchar(JSON.stringify(e.styleTags))
  app.appendVarchar(e.formality)
  app.appendVarchar(e.warmth)
  app.appendVarchar(e.gender)
  app.appendBoolean(e.available)
  app.appendVarchar(e.source)
  if (e.availableSizes === null) app.appendNull()
  else app.appendVarchar(JSON.stringify(e.availableSizes))
  app.appendVarchar(e.stockStatus)
  if (e.stockQuantity === null) app.appendNull()
  else app.appendInteger(e.stockQuantity)
  app.appendVarchar(e.availabilitySource)
  app.endRow()
}

async function main() {
  const csvPath = config.catalog.csvPath
  const dbPath = config.catalog.dbPath

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Catalog CSV not found at ${csvPath} (set CATALOG_CSV_PATH).`)
  }

  // Idempotent: rebuild from scratch.
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  for (const f of [dbPath, `${dbPath}.wal`]) {
    if (fs.existsSync(f)) fs.rmSync(f)
  }

  console.log(`→ Reading CSV:   ${csvPath}`)
  console.log(`→ Building DB:   ${dbPath}`)

  const instance = await DuckDBInstance.create(dbPath)
  const conn = await instance.connect()

  // Let DuckDB parse the CSV (streamed by the engine, not buffered in JS).
  const csvLiteral = csvPath.replace(/'/g, "''")
  await conn.run(
    `CREATE TABLE raw AS SELECT * FROM read_csv('${csvLiteral}', header=true, all_varchar=true, ignore_errors=true)`,
  )
  const totalRow = (await conn.runAndReadAll('SELECT count(*)::INTEGER AS n FROM raw')).getRowObjects()
  const total = Number(totalRow[0].n)
  console.log(`→ Source rows:   ${total.toLocaleString()}`)

  await conn.run(`
    CREATE TABLE products (
      id VARCHAR PRIMARY KEY,
      sourceId INTEGER,
      brand VARCHAR,
      title VARCHAR,
      price DOUBLE,
      listPrice DOUBLE,
      currency VARCHAR,
      url VARCHAR,
      image VARCHAR,
      category VARCHAR,
      subcategory VARCHAR,
      colors VARCHAR,
      styleTags VARCHAR,
      formality VARCHAR,
      warmth VARCHAR,
      gender VARCHAR,
      available BOOLEAN,
      source VARCHAR,
      availableSizes VARCHAR,
      stockStatus VARCHAR,
      stockQuantity INTEGER,
      availabilitySource VARCHAR
    )
  `)

  let imported = 0
  let discarded = 0
  const seen = new Set<string>()

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const reader = await conn.runAndReadAll(
      `SELECT id, brand, title, sold_price, actual_price, url, img
       FROM raw ORDER BY TRY_CAST(id AS INTEGER) NULLS LAST
       LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
    )
    const rows = reader.getRowObjects() as unknown as RawRow[]
    if (rows.length === 0) break

    const app = await conn.createAppender('products')
    for (const r of rows) {
      const e = enrichRow(r, CURRENCY)
      if (!e || seen.has(e.id)) {
        discarded++
        continue
      }
      seen.add(e.id)
      appendProduct(app, e)
      imported++
    }
    app.flushSync()
    app.closeSync()
    process.stdout.write(`\r  imported ${imported.toLocaleString()} / ${total.toLocaleString()}…`)
  }
  process.stdout.write('\n')

  // Indexes for efficient retrieval.
  await conn.run('CREATE INDEX idx_products_category ON products(category)')
  await conn.run('CREATE INDEX idx_products_price ON products(price)')
  await conn.run('CREATE INDEX idx_products_gender ON products(gender)')
  await conn.run('DROP TABLE raw')

  // Report category distribution.
  const dist = (
    await conn.runAndReadAll(
      'SELECT category, count(*)::INTEGER AS n FROM products GROUP BY category ORDER BY n DESC',
    )
  ).getRowObjects()

  conn.closeSync()

  console.log('\n✓ Import complete')
  console.log(`  imported:  ${imported.toLocaleString()}`)
  console.log(`  discarded: ${discarded.toLocaleString()} (no price / no title / duplicate)`)
  console.log('  categories:')
  for (const d of dist) {
    console.log(`    ${String(d.category).padEnd(12)} ${Number(d.n).toLocaleString()}`)
  }
}

main().catch((err) => {
  console.error('\n❌ Import failed:', err)
  process.exit(1)
})
