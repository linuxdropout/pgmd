import { createStore } from 'jotai'
import { describe, expect, test } from 'vitest'
import { counterAtom, incrementCounterAtom } from './counterAtoms'

describe('counterAtoms', () => {
  test('increments counter value through write atom', () => {
    const store = createStore()

    expect(store.get(counterAtom)).toBe(0)

    store.set(incrementCounterAtom)
    store.set(incrementCounterAtom)

    expect(store.get(counterAtom)).toBe(2)
  })
})
