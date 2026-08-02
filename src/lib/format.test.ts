import { describe, expect, it } from 'vitest'
import { initials, money, dateRu } from './format'

describe('format helpers',()=>{
  it('formats KGS amounts',()=>expect(money(75000)).toContain('75'))
  it('builds two-letter initials',()=>expect(initials('Сайкал Токтосунова')).toBe('СТ'))
  it('formats ISO date',()=>expect(dateRu('2026-08-13')).toBe('13.08.2026'))
})
