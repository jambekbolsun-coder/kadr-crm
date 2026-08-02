import { describe, expect, it } from 'vitest'
import { isChronological, normalizeHttpUrl } from './validation'

describe('validation helpers',()=>{
  it('normalizes a domain to https',()=>expect(normalizeHttpUrl('example.com/x')).toBe('https://example.com/x'))
  it('rejects non-http protocols',()=>expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull())
  it('validates chronological ranges',()=>expect(isChronological('2026-08-01T10:00','2026-08-01T11:00')).toBe(true))
  it('rejects reversed ranges',()=>expect(isChronological('2026-08-01T12:00','2026-08-01T11:00')).toBe(false))
})
