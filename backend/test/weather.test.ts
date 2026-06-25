import { describe, it, expect } from 'vitest'
import type { IntentMetadata } from '@copilot/shared'
import {
  enrichIntentWeather,
  formatWeatherContext,
  parseEventDate,
  resolveWeatherContext,
  temperatureToWarmthWord,
  weatherCodeLabel,
} from '../src/weather/provider'
import { deriveTargetWarmth } from '../src/rules/engine'

function intent(overrides: Partial<IntentMetadata> = {}): IntentMetadata {
  return {
    occasion: 'casual dinner',
    location: 'Barcelona',
    weatherContext: null,
    desiredStyle: 'elegant but comfortable',
    budgetLevel: 'unknown',
    minBudget: null,
    maxBudget: 250,
    anchorItems: [],
    avoidItems: [],
    avoidColors: [],
    preferredColors: [],
    requiredCategories: [],
    optionalCategories: [],
    recommendationGoal: 'complete outfit',
    sizeConstraints: null,
    requestedSizes: [],
    genderPreference: 'women',
    ...overrides,
  }
}

describe('temperature → warmth keyword', () => {
  it('maps cold/mild/hot by threshold', () => {
    expect(temperatureToWarmthWord(5)).toBe('cold')
    expect(temperatureToWarmthWord(11)).toBe('cold')
    expect(temperatureToWarmthWord(18)).toBe('mild')
    expect(temperatureToWarmthWord(24)).toBe('hot')
    expect(temperatureToWarmthWord(31)).toBe('hot')
  })

  it('produces strings the engine maps to a target warmth', () => {
    expect(deriveTargetWarmth(intent({ weatherContext: formatWeatherContext(6, 61) }))).toBe('warm')
    expect(deriveTargetWarmth(intent({ weatherContext: formatWeatherContext(30, 0) }))).toBe('light')
    expect(deriveTargetWarmth(intent({ weatherContext: formatWeatherContext(18, 3) }))).toBe('medium')
  })
})

describe('WMO code → label', () => {
  it('labels representative codes', () => {
    expect(weatherCodeLabel(0)).toBe('clear')
    expect(weatherCodeLabel(3)).toBe('partly cloudy')
    expect(weatherCodeLabel(63)).toBe('rain')
    expect(weatherCodeLabel(75)).toBe('snow')
    expect(weatherCodeLabel(95)).toBe('thunderstorm')
  })
})

describe('parseEventDate', () => {
  const today = new Date(2026, 5, 25) // 25 Jun 2026 (local)

  it('handles today / tonight', () => {
    expect(parseEventDate('dinner tonight', today).getTime()).toBe(today.getTime())
  })

  it('handles tomorrow', () => {
    const d = parseEventDate('lunch tomorrow', today)
    expect(Math.round((d.getTime() - today.getTime()) / 86_400_000)).toBe(1)
  })

  it('resolves the next upcoming weekday, today included', () => {
    const d = parseEventDate('casual dinner this Saturday', today)
    expect(d.getDay()).toBe(6) // Saturday
    expect(d.getTime()).toBeGreaterThanOrEqual(today.getTime())
    expect((d.getTime() - today.getTime()) / 86_400_000).toBeLessThan(7)
  })

  it('"next <weekday>" jumps a further week', () => {
    const thisSat = parseEventDate('this saturday', today)
    const nextSat = parseEventDate('next saturday', today)
    expect((nextSat.getTime() - thisSat.getTime()) / 86_400_000).toBe(7)
  })

  it('parses an explicit ISO date', () => {
    const d = parseEventDate('event on 2026-07-04', today)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(4)
  })

  it('defaults to today when no date is mentioned', () => {
    expect(parseEventDate('a casual dinner', today).getTime()).toBe(today.getTime())
  })
})

describe('enrichIntentWeather (no network in tests)', () => {
  it('is disabled during tests, leaving weatherContext null', async () => {
    expect(await resolveWeatherContext('Barcelona', new Date())).toBeNull()
    const out = await enrichIntentWeather(intent(), 'dinner this Saturday in Barcelona')
    expect(out.weatherContext).toBeNull()
  })

  it('never overwrites user-stated weather', async () => {
    const stated = intent({ weatherContext: 'cold winter night' })
    const out = await enrichIntentWeather(stated, 'tomorrow')
    expect(out).toBe(stated)
    expect(out.weatherContext).toBe('cold winter night')
  })

  it('is a no-op without a location', async () => {
    const out = await enrichIntentWeather(intent({ location: null }), 'tomorrow')
    expect(out.weatherContext).toBeNull()
  })
})
