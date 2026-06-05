// Component: SimilarityCloud (PLAN /cloud §7.4). jsdom has no WebGL, so `three` is
// mocked (per the PhyloTree/Plotly precedent): a minimal fake scene records nothing
// but lets the component reach its ready state, so we can assert the spinner→ready
// transition, that every control toggles state without throwing, that a pick-through
// click routes (or sets the facet in selectable mode), and that reduced motion
// disables idle rotation. `cloud.json` loading is mocked; raycasting returns index 0.
import { fireEvent, render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CloudData } from '../../src/lib/cloud/types'

// ── minimal three mock: just enough surface for init + pick ──────────────────────
vi.mock('three', () => {
  class BufferAttribute {
    array: ArrayLike<number>
    itemSize: number
    needsUpdate = false
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array
      this.itemSize = itemSize
    }
  }
  class BufferGeometry {
    attributes: Record<string, BufferAttribute> = {}
    setAttribute(name: string, attr: BufferAttribute) {
      this.attributes[name] = attr
    }
    getAttribute(name: string) {
      return this.attributes[name]
    }
    setIndex() {}
    computeBoundingSphere() {}
    dispose() {}
  }
  return {
    WebGLRenderer: class {
      domElement: HTMLCanvasElement
      constructor(o: { canvas?: HTMLCanvasElement }) {
        this.domElement = o?.canvas ?? document.createElement('canvas')
      }
      setPixelRatio() {}
      setSize() {}
      render() {}
      dispose() {}
    },
    Scene: class {
      children: unknown[] = []
      add(o: unknown) {
        this.children.push(o)
      }
      remove() {}
    },
    PerspectiveCamera: class {
      position = { set() {} }
      aspect = 1
      lookAt() {}
      updateProjectionMatrix() {}
    },
    Raycaster: class {
      params: Record<string, unknown> = { Points: {} }
      setFromCamera() {}
      intersectObject() {
        return [{ index: 0, distance: 1 }]
      }
    },
    ShaderMaterial: class {
      uniforms: Record<string, { value: number }>
      constructor(o: { uniforms: Record<string, { value: number }> }) {
        this.uniforms = o.uniforms
      }
      dispose() {}
    },
    LineBasicMaterial: class {
      dispose() {}
    },
    BufferGeometry,
    BufferAttribute,
    Points: class {
      frustumCulled = true
      constructor(
        public geometry: unknown,
        public material: unknown,
      ) {}
    },
    LineSegments: class {
      visible = true
      constructor(
        public geometry: unknown,
        public material: unknown,
      ) {}
    },
    Vector2: class {
      constructor(
        public x: number,
        public y: number,
      ) {}
    },
  }
})

vi.mock('svelte-spa-router', () => ({ push: vi.fn() }))

const loadMock = vi.hoisted(() => ({ cloud: vi.fn() }))
vi.mock('../../src/lib/data/load', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, loadCloud: (...a: unknown[]) => loadMock.cloud(...a) }
})

import SimilarityCloud from '../../src/lib/components/SimilarityCloud.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { push } from 'svelte-spa-router'
import { resetStore } from '../helpers'

const FIXTURE: CloudData = {
  meta: { generated: 'x', method: 'pcoa', scale: 100, k_nn: 2, version: 1 },
  main: {
    var: [0.2, 0.15, 0.1, 0.08, 0.05, 0.04],
    points: [
      { id: 'A', tandem_id: 'T1', member_id: 'T1.m1', ord: 1, spec: 'TRP', phylum: 'Firmicutes', func: 'aaRS', type: 'Transcriptional', conf: 'high', mixed: false, ddg: -12, ident: 80, ncores: 2, x: 0, y: 0, z: 0 },
      { id: 'B', tandem_id: 'T2', member_id: 'T2.m1', ord: 1, spec: 'LEU', phylum: 'Actinobacteria', func: 'transporter', type: 'Translational', conf: 'low', mixed: false, ddg: -5, ident: 60, ncores: 2, x: 10, y: 2, z: -3 },
      { id: 'C', tandem_id: 'T3', member_id: 'T3.m1', ord: 1, spec: null, phylum: null, func: 'unknown', type: 'Transcriptional', conf: 'high', mixed: true, ddg: null, ident: null, ncores: 3, x: -8, y: 5, z: 1 },
    ],
    edges: [
      [0, 1],
      [1, 2],
    ],
  },
  fallback: {
    var: [0.5, 0.25, 0.1, 0.05, 0.05, 0.05],
    points: [
      { id: 'D', tandem_id: 'T4', member_id: 'T4.m1', ord: 1, spec: 'ILE', phylum: 'Firmicutes', func: 'biosynthesis', type: 'Transcriptional', conf: 'high', mixed: false, ddg: -8, ident: 70, ncores: 2, x: 1, y: 1, z: 1 },
    ],
    edges: [],
  },
}

let getCtx: PropertyDescriptor | undefined

beforeEach(() => {
  // Pretend WebGL is available so the scene builds (jsdom returns null otherwise).
  getCtx = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext
  loadMock.cloud.mockResolvedValue(FIXTURE)
  store.cloud = FIXTURE
  store.cloudStatus = 'ready'
  store.loci = []
  store.status = 'ready'
  store.reset()
  vi.mocked(push).mockClear()
})

afterEach(() => {
  resetStore()
  if (getCtx) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getCtx)
})

/** Render and wait until the WebGL canvas has been mounted (scene ready). */
async function renderReady(props = {}) {
  const utils = render(SimilarityCloud, { props })
  await waitFor(() => expect(utils.container.querySelector('canvas')).toBeTruthy())
  return utils
}

describe('SimilarityCloud', () => {
  test('shows a spinner until three + cloud.json are ready', () => {
    store.cloud = null
    store.cloudStatus = 'loading'
    const { getByRole } = render(SimilarityCloud)
    // three is dynamically imported (async), so right after render it is not ready.
    expect(getByRole('status')).toBeInTheDocument()
  })

  test('mounts a canvas and the full HUD once ready', async () => {
    const { getByRole, getByText } = await renderReady()
    expect(getByRole('button', { name: 'Locus' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Element' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Specifier' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
    // honest variance readout (3 axes capture 45% here: 0.2+0.15+0.1)
    expect(getByText(/PCoA axes capture/)).toBeInTheDocument()
    expect(getByText(/45%/)).toBeInTheDocument()
  })

  test('toggling controls updates state without throwing', async () => {
    const { getByRole } = await renderReady()
    await fireEvent.click(getByRole('button', { name: 'Element' }))
    expect(getByRole('button', { name: 'Element' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(getByRole('button', { name: 'Fallback' }))
    expect(getByRole('button', { name: 'Fallback' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(getByRole('button', { name: 'Taxonomy' }))
    expect(getByRole('button', { name: 'Taxonomy' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(getByRole('button', { name: 'Advanced…' }))
    expect(getByRole('button', { name: 'Advanced…' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('clicking a point navigates to its locus detail page (default mode)', async () => {
    const { container } = await renderReady()
    const canvas = container.querySelector('canvas')!
    await fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20 })
    await fireEvent.pointerUp(canvas, { clientX: 20, clientY: 20 })
    expect(push).toHaveBeenCalledWith('/locus/T1') // raycast → index 0 → T1
  })

  test('selectable mode: clicking a point toggles the specifier facet', async () => {
    const { container } = await renderReady({ selectable: true })
    const canvas = container.querySelector('canvas')!
    await fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20 })
    await fireEvent.pointerUp(canvas, { clientX: 20, clientY: 20 })
    expect(push).not.toHaveBeenCalled()
    expect(store.filter.specifier.has('TRP')).toBe(true) // index 0 → spec TRP
  })

  test('a WebGL-unavailable browser shows a graceful text fallback', async () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext
    const { findByText } = render(SimilarityCloud)
    expect(await findByText(/WebGL unavailable/i)).toBeInTheDocument()
  })
})

describe('SimilarityCloud reduced motion', () => {
  test('disables idle rotation under prefers-reduced-motion', () => {
    const mql = { matches: true, media: '', addEventListener() {}, removeEventListener() {} }
    vi.stubGlobal('matchMedia', () => mql)
    const { getByText, getByLabelText } = render(SimilarityCloud)
    expect(getByText(/reduced motion/i)).toBeInTheDocument()
    const idle = getByLabelText(/Idle rotation/i) as HTMLInputElement
    expect(idle.disabled).toBe(true)
    expect(idle.checked).toBe(false)
    vi.unstubAllGlobals()
  })
})
