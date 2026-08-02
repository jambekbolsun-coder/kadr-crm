import { describe, expect, it } from 'vitest'
import { EVENT_COLORS, PERMISSIONS, TASK_STATUS_LABELS } from './constants'

describe('domain constants',()=>{
  it('keeps distinct permission codes',()=>expect(new Set(Object.values(PERMISSIONS)).size).toBe(Object.values(PERMISSIONS).length))
  it('has visible calendar colors',()=>expect(EVENT_COLORS.deadline).not.toBe(EVENT_COLORS.project))
  it('contains review task state',()=>expect(TASK_STATUS_LABELS.review).toBe('На проверке'))
})
