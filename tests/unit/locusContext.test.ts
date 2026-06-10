// Unit: the lazy per-locus genomic-context loaders. Mirrors the r2dt loader contract —
// cache a successful result, resolve null (→ schematic fallback) on a missing/failed
// fetch, and clear the cache slot on null so a later view retries. fetch is stubbed; the
// module-level caches are reset per test via vi.resetModules + dynamic import.
import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

async function freshModule() {
  vi.resetModules()
  return import('../../src/lib/locusContext')
}

const CTX = {
  tandem_id: 'T0001',
  accession: 'ACC',
  strand: '+',
  resolved: true,
  interval: [1, 20],
  seq: 'ACGT',
  elements: [{ member_id: 'T0001.m1', offset: 0, length: 4 }],
  downstream_genes: [],
  warnings: [],
}

describe('loadLocusContext', () => {
  test('fetches + parses a locus context and caches it (one fetch for repeat calls)', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(CTX), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadLocusContext } = await freshModule()

    const a = await loadLocusContext('T0001')
    const b = await loadLocusContext('T0001')
    expect(a).toEqual(CTX)
    expect(b).toBe(a) // same cached promise result
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('data/locus_context/T0001.json')
  })

  test('resolves null on a 404 and does NOT cache it (a later view retries)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(CTX), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadLocusContext } = await freshModule()

    expect(await loadLocusContext('T0009')).toBeNull()
    // the null cleared the slot, so the second call re-fetches and now succeeds
    expect(await loadLocusContext('T0009')).toEqual(CTX)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('resolves null when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    const { loadLocusContext } = await freshModule()
    expect(await loadLocusContext('T0042')).toBeNull()
  })
})

describe('loadLocusContextManifest', () => {
  test('fetches the manifest once and caches it', async () => {
    const manifest = { meta: { generated: 'x', version: 1, source: 'ncbi-entrez', count: 1, resolved_loci: 1, fetched_genes: 1 }, loci: { T0001: true } }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadLocusContextManifest } = await freshModule()

    expect(await loadLocusContextManifest()).toEqual(manifest)
    expect(await loadLocusContextManifest()).toEqual(manifest)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('data/locus_context/manifest.json')
  })

  test('resolves null on absence and retries on a later call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const { loadLocusContextManifest } = await freshModule()
    expect(await loadLocusContextManifest()).toBeNull()
  })
})
