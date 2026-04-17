import { atom } from 'jotai'
import { z } from 'zod'

const counterValueSchema = z.number().int().nonnegative()
const initialCounterValue = counterValueSchema.parse(0)

export const counterAtom = atom(initialCounterValue)

export const incrementCounterAtom = atom(null, (get, set) => {
  const nextCounterValue = counterValueSchema.parse(get(counterAtom) + 1)
  set(counterAtom, nextCounterValue)
})
