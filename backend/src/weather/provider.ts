import type { IntentMetadata } from '@copilot/shared'
import { config } from '../config'

// ---------------------------------------------------------------------------
// Deterministic weather enrichment for the intent.
//
// The LLM is forbidden from inventing weather (see llm/intent.ts), so when the
// shopper gives a location + date but no explicit weather, `weatherContext`
// stays null and the engine treats warmth as "unknown". This module fills that
// gap with a REAL forecast from Open-Meteo (free, no API key):
//
//   location text ──geocode──▶ lat/lon ──forecast──▶ daily temp + condition
//
// The output is a short string ("cold, 8°C, light rain") whose keywords are
// understood by rules/engine.ts `deriveTargetWarmth` (cold→warm, hot→light).
//
// Every failure path (disabled, no location, network error, date out of the
// ~16-day forecast window) returns null, i.e. the pre-existing behaviour — so
// the deterministic engine stays deterministic given its input and never
// regresses when the API is unreachable.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_FORECAST_DAYS = 15 // Open-Meteo serves ~16 days; stay safely inside.

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  // Spanish, since intents may arrive in either language.
  domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6,
}

/** WMO weather interpretation codes → short human label. */
export function weatherCodeLabel(code: number): string {
  if (code === 0) return 'clear'
  if (code <= 3) return 'partly cloudy'
  if (code <= 48) return 'foggy'
  if (code <= 57) return 'drizzle'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'rain showers'
  if (code <= 86) return 'snow showers'
  return 'thunderstorm'
}

/**
 * Map a mean temperature to a warmth keyword the engine recognises.
 * "cold" → engine targets warm clothes; "hot" → light; "mild" → medium.
 */
export function temperatureToWarmthWord(tempC: number): 'cold' | 'mild' | 'hot' {
  if (tempC <= 11) return 'cold'
  if (tempC >= 24) return 'hot'
  return 'mild'
}

/** Compose the final weatherContext string from a day's stats. */
export function formatWeatherContext(tempC: number, code: number): string {
  return `${temperatureToWarmthWord(tempC)}, ${Math.round(tempC)}°C, ${weatherCodeLabel(code)}`
}

/**
 * Resolve a relative/absolute date mentioned in the request to a calendar day.
 * Deterministic and offline. Returns `today` when nothing is recognised.
 *
 * Recognises: explicit YYYY-MM-DD, today/tonight, tomorrow, this weekend, and
 * "(this|next)? <weekday>" — picking the next upcoming occurrence.
 */
export function parseEventDate(text: string, today: Date = new Date()): Date {
  const t = text.toLowerCase()
  const base = startOfDay(today)

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return d
  }

  if (/\btomorrow\b|\bmañana\b/.test(t)) return addDays(base, 1)
  if (/\b(today|tonight|esta noche|hoy)\b/.test(t)) return base
  if (/\b(this )?weekend|fin de semana\b/.test(t)) return nextWeekday(base, 6) // Saturday

  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const wantsNext = new RegExp(`\\bnext\\s+${name}\\b|\\bpr[oó]ximo\\s+${name}\\b`).test(t)
      const target = nextWeekday(base, dow)
      return wantsNext ? addDays(target, 7) : target
    }
  }

  return base
}

/**
 * Look up live weather for a location on a given date. Returns a context string
 * or null on any failure (disabled, unknown city, out-of-range date, network).
 */
export async function resolveWeatherContext(
  location: string | null,
  date: Date,
): Promise<string | null> {
  if (!config.weather.enabled) return null
  const city = location?.trim()
  if (!city) return null

  const daysAhead = Math.round((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / DAY_MS)
  if (daysAhead < 0 || daysAhead > MAX_FORECAST_DAYS) return null // outside forecast window

  try {
    const place = await geocode(city)
    if (!place) return null
    const day = await fetchDailyForecast(place.latitude, place.longitude, date)
    if (!day) return null
    return formatWeatherContext(day.meanTempC, day.weatherCode)
  } catch {
    return null // never let weather break a recommendation
  }
}

/**
 * Enrich an intent with a real forecast. The user's own weather wording is
 * authoritative and is never overwritten; we only fill a null weatherContext.
 */
export async function enrichIntentWeather(
  intent: IntentMetadata,
  rawText: string,
): Promise<IntentMetadata> {
  if (intent.weatherContext) return intent // user stated it, or already enriched
  if (!intent.location) return intent
  const context = await resolveWeatherContext(intent.location, parseEventDate(rawText))
  return context ? { ...intent, weatherContext: context } : intent
}

// --- Open-Meteo HTTP --------------------------------------------------------

interface GeoPlace {
  latitude: number
  longitude: number
}

async function geocode(city: string): Promise<GeoPlace | null> {
  const url = new URL(config.weather.geocodeUrl)
  url.searchParams.set('name', city)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  const res = await fetch(url, { signal: AbortSignal.timeout(config.weather.timeoutMs) })
  if (!res.ok) return null
  const data = (await res.json()) as { results?: { latitude: number; longitude: number }[] }
  const top = data.results?.[0]
  if (!top || typeof top.latitude !== 'number' || typeof top.longitude !== 'number') return null
  return { latitude: top.latitude, longitude: top.longitude }
}

interface DailyForecast {
  meanTempC: number
  weatherCode: number
}

async function fetchDailyForecast(
  lat: number,
  lon: number,
  date: Date,
): Promise<DailyForecast | null> {
  const day = toIsoDate(date)
  const url = new URL(config.weather.forecastUrl)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('start_date', day)
  url.searchParams.set('end_date', day)
  const res = await fetch(url, { signal: AbortSignal.timeout(config.weather.timeoutMs) })
  if (!res.ok) return null
  const data = (await res.json()) as {
    daily?: {
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      weather_code?: number[]
    }
  }
  const max = data.daily?.temperature_2m_max?.[0]
  const min = data.daily?.temperature_2m_min?.[0]
  const code = data.daily?.weather_code?.[0]
  if (typeof max !== 'number' || typeof min !== 'number') return null
  return { meanTempC: (max + min) / 2, weatherCode: typeof code === 'number' ? code : 0 }
}

// --- date helpers -----------------------------------------------------------

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

/** The next occurrence of `dow` (0=Sun..6=Sat), today included. */
function nextWeekday(from: Date, dow: number): Date {
  const delta = (dow - from.getDay() + 7) % 7
  return addDays(from, delta)
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
