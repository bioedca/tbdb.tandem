// Component: SimilarityCloud (PLAN /cloud §7.4). jsdom has no WebGL, so `three` is
// mocked (per the PhyloTree/Plotly precedent): a minimal fake scene records nothing
// but lets the component reach its ready state, so we can assert the spinner→ready
// transition, that every control toggles state without throwing, that a pick-through
// click routes (or sets the facet in selectable mode), and that reduced motion
// disables idle rotation. `cloud.json` loading is mocked; the screen-space picker
// projects through a deterministic mock `Vector3.project` (world→NDC, ÷100), so on a
// pinned 800×600 rect the world-origin point (T1) lands at the canvas centre and a
// centred click resolves to render index 0.
import { fireEvent, render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CloudData } from '../../src/lib/cloud/types'

// Records the latest mock camera so a test can observe the RENDERED orbit (the damped
// camera position) — that is the only window onto the new drag-rotate / damping / frame
// wiring, since orbit/targetOrbit are component-local.
const cameraCapture = vi.hoisted(
  () => ({ last: null as { position: { x: number; y: number; z: number } } | null }),
)

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
      // A recording position so applyCamera()'s writes are observable to tests.
      position = {
        x: 0,
        y: 0,
        z: 0,
        set(x: number, y: number, z: number) {
          this.x = x
          this.y = y
          this.z = z
        },
      }
      aspect = 1
      matrixWorldInverse = {}
      projectionMatrix = {}
      lookAt() {}
      updateProjectionMatrix() {}
      updateMatrixWorld() {}
      constructor() {
        cameraCapture.last = this
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
    Vector3: class {
      x = 0
      y = 0
      z = 0
      constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
      }
      set(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
        return this
      }
      applyMatrix4() {
        return this
      }
      // Deterministic stand-in for the real view+projection: squash world→NDC by ÷100,
      // so the fixture's points land at predictable canvas pixels (world origin → centre).
      project() {
        this.x = this.x / 100
        this.y = this.y / 100
        this.z = this.z / 100
        return this
      }
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
// The orbit module is NOT mocked — import the real pivot math to predict the camera.
import { robustCenter } from '../../src/lib/cloud/orbit'

const FIXTURE: CloudData = {
  meta: { generated: 'x', method: 'pcoa', scale: 100, k_nn: 2, version: 1 },
  main: {
    var: [0.2, 0.15, 0.1, 0.08, 0.05, 0.04],
    points: [
      { id: 'OUT1', tandem_id: 'T0281', member_id: 'T0281.m2', ord: 2, spec: 'ILE', phylum: 'Firmicutes', func: 'aaRS', type: 'Translational', conf: 'low', mixed: true, ddg: null, ident: 40, ncores: 2, x: 1000, y: 1000, z: 0 },
      { id: 'A', tandem_id: 'T1', member_id: 'T1.m1', ord: 1, spec: 'TRP', phylum: 'Firmicutes', func: 'aaRS', type: 'Transcriptional', conf: 'high', mixed: false, ddg: -12, ident: 80, ncores: 2, x: 0, y: 0, z: 0 },
      { id: 'B', tandem_id: 'T2', member_id: 'T2.m1', ord: 1, spec: 'LEU', phylum: 'Actinobacteria', func: 'transporter', type: 'Translational', conf: 'low', mixed: false, ddg: -5, ident: 60, ncores: 2, x: 10, y: 2, z: -3 },
      { id: 'C', tandem_id: 'T3', member_id: 'T3.m1', ord: 1, spec: null, phylum: null, func: 'unknown', type: 'Transcriptional', conf: 'high', mixed: true, ddg: null, ident: null, ncores: 3, x: -8, y: 5, z: 1 },
      { id: 'OUT2', tandem_id: 'T0445', member_id: 'T0445.m1', ord: 1, spec: 'GLY', phylum: 'Firmicutes', func: 'unknown', type: 'Transcriptional', conf: 'low', mixed: true, ddg: null, ident: 40, ncores: 2, x: 2000, y: 2000, z: 0 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
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
    expect(getByText(/T0281 and T0445 remain in the database/i)).toBeInTheDocument()
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

  // jsdom drops clientX/clientY on synthetic PointerEvents but carries them on a
  // MouseEvent (the component's pointer listeners fire on the matching type string).
  // Pin a real rect so the centred click maps to the canvas centre, where the mock
  // projects the world-origin point T1 (render index 0; excluded T0281 is not in the set).
  const PINNED_RECT = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
  const clickCentre = (canvas: HTMLElement, type: string) =>
    fireEvent(canvas, new MouseEvent(type, { clientX: 400, clientY: 300, button: 0, bubbles: true }))

  test('clicking a point navigates to its locus detail page (default mode)', async () => {
    const { container } = await renderReady()
    const canvas = container.querySelector('canvas')!
    canvas.getBoundingClientRect = PINNED_RECT
    await clickCentre(canvas, 'pointerdown')
    await clickCentre(canvas, 'pointerup')
    expect(push).toHaveBeenCalledWith('/locus/T1') // centre click → nearest = index 0 → T1
  })

  test('selectable mode: clicking a point toggles the specifier facet', async () => {
    const { container } = await renderReady({ selectable: true })
    const canvas = container.querySelector('canvas')!
    canvas.getBoundingClientRect = PINNED_RECT
    await clickCentre(canvas, 'pointerdown')
    await clickCentre(canvas, 'pointerup')
    expect(push).not.toHaveBeenCalled()
    expect(store.filter.specifier.has('TRP')).toBe(true) // index 0 → spec TRP
  })

  test('hovering a point surfaces its tooltip and drives the highlight loop without throwing', async () => {
    const { container } = await renderReady()
    const canvas = container.querySelector('canvas')!
    canvas.getBoundingClientRect = PINNED_RECT
    // A hover (pointermove while not dragging) over the centre resolves to index 0 and
    // sets the highlight target; the per-frame applyHighlight then runs on the mock scene.
    fireEvent(canvas, new MouseEvent('pointermove', { clientX: 400, clientY: 300, bubbles: true }))
    await waitFor(() => expect(container.textContent).toMatch(/Specifier:\s*TRP/))
  })

  // ── Camera wiring: the new drag-rotate (de-inverted vertical), damping + framing ──
  // The pure orbit math is unit-tested in orbit.test.ts; these assert the COMPONENT
  // wires it correctly — drag mutates targetOrbit, the loop eases `orbit` onto it, and
  // applyCamera writes it to the (recording) camera. The mock camera's recorded
  // position is the observable; the render loop runs on requestAnimationFrame, so we
  // poll with waitFor rather than guess a frame count.
  // jsdom's synthetic PointerEvents don't carry clientX/clientY, but a MouseEvent does —
  // and the component's pointer listeners fire on the matching type string. (Real
  // browsers always carry the coords; this is purely a jsdom shim.)
  const pointer = (canvas: HTMLElement, type: string, clientY: number, button = 0) =>
    fireEvent(canvas, new MouseEvent(type, { clientX: 200, clientY, button, bubbles: true }))

  test('drag-DOWN tilts the camera UP and over the cloud (vertical axis NOT inverted)', async () => {
    const { container } = await renderReady()
    const canvas = container.querySelector('canvas')!
    const cam = cameraCapture.last!
    expect(cam).toBeTruthy()
    await waitFor(() => expect(Number.isFinite(cam.position.y)).toBe(true))
    const y0 = cam.position.y
    // A real drag (moved ≥ 4) downward by 80px — NOT a tap.
    await pointer(canvas, 'pointerdown', 200)
    await pointer(canvas, 'pointermove', 280)
    await pointer(canvas, 'pointerup', 280)
    // −dy ⇒ polar decreases ⇒ camera.y = target.y + distance·cos(polar) rises. Idle
    // rotation only changes azimuth, so camera.y isolates the vertical-drag direction.
    await waitFor(() => expect(cam.position.y).toBeGreaterThan(y0 + 0.5), { timeout: 2000 })
    expect(push).not.toHaveBeenCalled() // a drag, never routed as a click
  })

  test('a shaky sub-threshold tap navigates and does NOT move the camera', async () => {
    const { container } = await renderReady()
    const canvas = container.querySelector('canvas')!
    const cam = cameraCapture.last!
    await waitFor(() => expect(Number.isFinite(cam.position.y)).toBe(true))
    const y0 = cam.position.y
    // Pin the rect + tap at the centre (where T1 projects); 3px of vertical jitter ⇒
    // moved = 3 < 4 ⇒ still a click, NOT a drag.
    canvas.getBoundingClientRect = PINNED_RECT
    const tap = (type: string, clientY: number) =>
      fireEvent(canvas, new MouseEvent(type, { clientX: 400, clientY, button: 0, bubbles: true }))
    await tap('pointerdown', 300)
    await tap('pointermove', 303)
    await tap('pointerup', 303)
    expect(push).toHaveBeenCalledWith('/locus/T1') // routed as a tap → navigates
    // Below threshold the camera is untouched: polar (hence camera.y, which idle
    // rotation never changes) stays put. Pre-fix the 3px jitter shifted it ~0.5.
    await new Promise((r) => setTimeout(r, 120))
    expect(Math.abs(cam.position.y - y0)).toBeLessThan(0.1)
  })

  test('wheel-out dollies the camera away from the pivot (zoom feeds the input orbit)', async () => {
    const { container } = await renderReady()
    const canvas = container.querySelector('canvas')!
    const cam = cameraCapture.last!
    // Pin a non-zero rect + send a CENTERED wheel so the zoom is about the pivot
    // (ndc 0,0) deterministically — not relying on jsdom's zero-rect centre fallback.
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect
    // The framed pivot is the robust centre of the rendered (locus) points; idle
    // rotation never changes the distance from it, so a growth isolates the zoom.
    const visibleMainPoints = FIXTURE.main.points.filter((p) => !['T0281', 'T0445'].includes(p.tandem_id))
    const t = robustCenter(visibleMainPoints, 0.95)
    const distFromPivot = () => Math.hypot(cam.position.x - t.x, cam.position.y - t.y, cam.position.z - t.z)
    await waitFor(() => expect(distFromPivot()).toBeGreaterThan(0))
    const d0 = distFromPivot()
    // Centered cursor (400,300) ⇒ ndc (0,0) ⇒ zoom about the pivot; positive deltaY ⇒ OUT.
    await fireEvent(canvas, new WheelEvent('wheel', { deltaY: 240, clientX: 400, clientY: 300, bubbles: true, cancelable: true }))
    await waitFor(() => expect(distFromPivot()).toBeGreaterThan(d0 + 0.5), { timeout: 2000 })
  })

  test('a flick keeps the camera gliding after release (momentum); a slow stop does not', async () => {
    // Drive a 2D pointer drag (MouseEvent carries the coords jsdom drops on PointerEvent).
    const drag = (canvas: HTMLElement, x: number, y: number, type: string) =>
      fireEvent(canvas, new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }))
    // Horizontal travel of the camera (a horizontal drag keeps polar — and thus y — fixed).
    const xz = (p: { x: number; z: number }) => ({ x: p.x, z: p.z })
    const chord = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      Math.hypot(a.x - b.x, a.z - b.z)

    // Measure how far the camera travels AFTER release for a given gesture.
    const postReleaseTravel = async (flick: boolean): Promise<number> => {
      const { container, unmount } = render(SimilarityCloud)
      await waitFor(() => expect(container.querySelector('canvas')).toBeTruthy())
      const canvas = container.querySelector('canvas')!
      const cam = cameraCapture.last!
      await waitFor(() => expect(Number.isFinite(cam.position.x)).toBe(true))
      await drag(canvas, 200, 200, 'pointerdown')
      await drag(canvas, 320, 200, 'pointermove') // fast horizontal sweep (idle now off)
      if (!flick) await drag(canvas, 320, 200, 'pointermove') // pause ⇒ zero release velocity
      const atRelease = xz(cam.position)
      await drag(canvas, 320, 200, 'pointerup')
      await new Promise((r) => setTimeout(r, 450)) // let momentum + damping play out
      const travel = chord(atRelease, xz(cam.position))
      unmount()
      return travel
    }

    const flickTravel = await postReleaseTravel(true)
    const slowTravel = await postReleaseTravel(false)
    // Both ease in (damping), but only the flick adds a decaying glide, so it travels
    // clearly further after the finger lifts.
    expect(slowTravel).toBeGreaterThan(0)
    expect(flickTravel).toBeGreaterThan(slowTravel * 1.5)
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
