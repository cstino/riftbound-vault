import { useEffect, useState } from 'react'
import { asset } from './data'
import type { MetaData } from './deck'

let metaPromise: Promise<MetaData | null> | null = null

/** Statistiche dei tornei (public/data/meta.json); null se il file non c'è. */
export function useMeta() {
  const [meta, setMeta] = useState<MetaData | null | undefined>(undefined)
  useEffect(() => {
    metaPromise ??= fetch(asset('data/meta.json'))
      .then((r) => (r.ok ? (r.json() as Promise<MetaData>) : null))
      .catch(() => null)
    let alive = true
    metaPromise.then((m) => alive && setMeta(m))
    return () => {
      alive = false
    }
  }, [])
  return meta
}

