import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { QUIZ, QUIZ_CATEGORIES } from '../data/quiz'
import type { RuleEntry } from '../lib/types'

const rules: RuleEntry[] = JSON.parse(readFileSync('public/data/rules.json', 'utf8')).rules
const exists = (ref: string) => rules.some((r) => r.n === ref)

describe('quiz fondato sulle regole ufficiali', () => {
  it('ogni regola citata esiste nel Core Rules', () => {
    const missing = QUIZ.flatMap((q) => q.rules.filter((r) => !exists(r)).map((r) => `${q.id}:${r}`))
    expect(missing).toEqual([])
  })
  it('ogni domanda cita almeno una regola e ha una spiegazione', () => {
    expect(QUIZ.filter((q) => !q.rules.length || q.explain.length < 20).map((q) => q.id)).toEqual([])
  })
  it('opzioni distinte e risposta valida', () => {
    const bad = QUIZ.filter((q) => q.options.length < 2 || q.options.length > 4 || new Set(q.options).size !== q.options.length || !(q.answer in q.options))
    expect(bad.map((q) => q.id)).toEqual([])
  })
  it('id unici e categorie note', () => {
    expect(new Set(QUIZ.map((q) => q.id)).size).toBe(QUIZ.length)
    const cats = new Set(QUIZ_CATEGORIES.map((c) => c.id))
    expect(QUIZ.filter((q) => !cats.has(q.category)).map((q) => q.id)).toEqual([])
  })
})
