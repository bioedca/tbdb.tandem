<script lang="ts">
  // The 3D Stem-I similarity cloud (PLAN /cloud) — a WebGL companion to `/tree`.
  //
  // EXPLORATORY similarity map, displayed with NO POLARITY (PLAN §6, §13): a point's
  // position is a 3D PCoA embedding of patristic distance — "these sequences resemble
  // each other," never lineage or order of appearance. The honest tension (you cannot
  // both de-overlap a crowded core AND preserve metric distance — overlap of
  // near-identical sequences IS the data) is resolved with an anchored-repulsion
  // "spread" (pure `cloud/relax.ts`) that de-piles for clickability while staying
  // anchored to truth and fully reversible. Every distortion is surfaced; the locus
  // detail pages remain the source of truth. A navigation aid, never a measurement.
  //
  // `three` is heavy, so it is dynamically import()-ed (exactly as PhyloTree does with
  // `phylotree`) — it never enters the boot bundle (§7.1). `cloud.json` is lazy-fetched
  // through the shared store (`ensureCloud`), so the dashboard cross-filter stays
  // centralized. All point logic (embedding join, spread, encodings, aggregation,
  // orbit math) lives in pure, unit-tested `lib/cloud/*` modules; this component only
  // wires them to WebGL + the DOM controls.
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'

  import { store } from '../stores/filters.svelte'
  import {
    aggregatePoints,
    pointAction,
    type CloudRenderPoint,
  } from '../cloud/aggregate'
  import {
    PRESET_ORDER,
    PRESETS,
    pointColor,
    sizeFactor,
  } from '../cloud/encodings'
  import {
    cameraPosition,
    clampDistance,
    defaultOrbit,
    orbitPan,
    orbitRotate,
    orbitZoom,
    type Orbit,
  } from '../cloud/orbit'
  import { createRelaxState, maxAnchorOffset, meanAnchorOffset, step, type RelaxState } from '../cloud/relax'
  import type { ColorMode, PresetKey, SizeMode, WhichTree } from '../cloud/types'
  import Card from './Card.svelte'
  import InfoTip from './InfoTip.svelte'
  import Spinner from './Spinner.svelte'

  /* eslint-disable @typescript-eslint/no-explicit-any */
  type ThreeNS = typeof import('three')

  // ── Props (mirror PhyloTree for dashboard-panel reuse, §6.4) ─────────────────────
  interface Props {
    /** Dashboard panel: a point click narrows the shared store by its specifier
     *  (toggle-clear) instead of opening the detail page. */
    selectable?: boolean
    /** Canvas height (inline; e.g. a tall value on /cloud, shorter on a panel). */
    height?: string
  }
  let { selectable = false, height = 'clamp(28rem, 70vh, 56rem)' }: Props = $props()

  // ── Controls (local to this view; the dashboard cross-filter is the store) ───────
  let which = $state<WhichTree>('main')
  let granularity = $state<'locus' | 'element'>('locus')
  let presetKey = $state<PresetKey>('specifier')
  let advanced = $state(false)
  let advColor = $state<ColorMode>('specifier')
  let advSize = $state<SizeMode>('uniform')
  let spread = $state(0)
  let constellation = $state(false)
  let highlightNonFirm = $state(false)
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Idle rotation defaults ON, but OFF under reduced motion (respected on first paint).
  let idleRotate = $state(!reducedMotion)

  // ── Lazy deps ────────────────────────────────────────────────────────────────────
  let THREE = $state<ThreeNS | null>(null)
  let webglFailed = $state(false)
  let containerEl: HTMLDivElement
  const ready = $derived(store.cloudStatus === 'ready' && THREE !== null && !webglFailed)

  // PHASE 2 (not built): a second, explicitly NON-METRIC "neighbourhood" layout
  // (UMAP on the patristic matrix, emitted as `tree.umap` by build_cloud.py behind a
  // guarded import) plus an animated MORPH between it and the PCoA layout. The anchored
  // `relax` stepper is already a per-frame position interpolator, so a morph would
  // lerp each point's anchor between the two layouts (instantaneous under reduced
  // motion) and the layout toggle would be labelled non-metric and never the default.

  // ── Derived render inputs (pure) ─────────────────────────────────────────────────
  const activeTree = $derived(store.cloud ? store.cloud[which] : null)
  const renderPoints = $derived<CloudRenderPoint[]>(
    activeTree ? aggregatePoints(activeTree.points, granularity) : [],
  )
  const colorMode = $derived<ColorMode>(advanced ? advColor : PRESETS[presetKey].color)
  const sizeMode = $derived<SizeMode>(advanced ? advSize : PRESETS[presetKey].size)
  const emphasizeNonFirm = $derived(
    highlightNonFirm || (!advanced && !!PRESETS[presetKey].emphasizeNonFirmicutes),
  )
  const tipCount = $derived(renderPoints.length)

  // Honest variance readout (PLAN §6.5): % of pairwise distance captured by 3 / 2 axes.
  const pct3D = $derived(activeTree ? Math.round(100 * (activeTree.var[0] + activeTree.var[1] + activeTree.var[2])) : 0)
  const pct2D = $derived(activeTree ? Math.round(100 * (activeTree.var[0] + activeTree.var[1])) : 0)
  let meanOffset = $state(0) // updated (throttled) from the relax loop

  // Cross-filter (PLAN §9): when the dashboard is filtered, dim out-of-selection loci.
  const selectedTandemIds = $derived(new Set(store.selected.map((l) => l.tandem_id)))
  const crossFiltered = $derived(store.isFiltered)

  // ── three scene (non-reactive holder so large objects aren't proxied) ────────────
  interface Scene {
    renderer: any
    scene: any
    camera: any
    raycaster: any
    pointsObj: any
    pointsGeom: any
    pointsMat: any
    linesObj: any
    linesGeom: any
    linesMat: any
    positions: Float32Array
    relax: RelaxState | null
    count: number
    settled: boolean
    raf: number
    /** dispose all GPU resources */
    dispose: () => void
  }
  let sc: Scene | null = null
  let orbit: Orbit = defaultOrbit()
  let lastOffsetTick = 0

  // ── Tooltip ──────────────────────────────────────────────────────────────────────
  let tip = $state<{ visible: boolean; x: number; y: number; lines: string[] }>({
    visible: false,
    x: 0,
    y: 0,
    lines: [],
  })
  function showTipFor(p: CloudRenderPoint, ev: PointerEvent | MouseEvent): void {
    const lines = [
      granularity === 'locus' && p.memberCount > 1
        ? `${p.tandem_id} · ${p.memberCount} elements`
        : `${p.tandem_id} · ${p.member_id}`,
      `Specifier: ${p.spec ?? '?'}`,
      `Phylum: ${p.phylum ?? 'unassigned'}`,
      `Function: ${p.func ?? 'unknown'} · ${p.type ?? '—'} · ${p.conf ?? '—'} conf`,
      `ΔΔG: ${p.ddg ?? '—'} · identity: ${p.ident ?? '—'}`,
    ]
    tip = { visible: true, x: ev.clientX + 14, y: ev.clientY + 14, lines }
  }
  function hideTip(): void {
    tip = { ...tip, visible: false }
  }

  // ── Shaders: round, depth-attenuated sprites; per-vertex color + size + alpha ─────
  const VERT = `
    attribute float asize;
    attribute float aalpha;
    attribute vec3 acolor;
    varying vec3 vColor;
    varying float vAlpha;
    uniform float uScale;
    uniform float uBase;
    void main() {
      vColor = acolor;
      vAlpha = aalpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = max(2.0, asize * uBase * (uScale / -mv.z));
      gl_Position = projectionMatrix * mv;
    }`
  const FRAG = `
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 d = gl_PointCoord - vec2(0.5);
      float r = dot(d, d);
      if (r > 0.25) discard;                 // round sprite
      float edge = smoothstep(0.25, 0.16, r); // soft antialiased rim
      gl_FragColor = vec4(vColor, vAlpha * edge);
    }`

  // ── Lifecycle ──────────────────────────────────────────────────────────────────
  onMount(() => {
    void store.ensureCloud()
    let disposed = false
    void import('three')
      .then((mod) => {
        if (!disposed) THREE = mod
      })
      .catch(() => {
        if (!disposed) webglFailed = true
      })
    return () => {
      disposed = true
      teardown()
    }
  })

  function teardown(): void {
    if (sc) {
      cancelAnimationFrame(sc.raf)
      sc.dispose()
      sc = null
    }
  }

  /** True iff a WebGL context can be created (jsdom / blocked GPUs → false → fallback). */
  function webglAvailable(canvas: HTMLCanvasElement): boolean {
    try {
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    } catch {
      return false
    }
  }

  // Build (or rebuild) the whole scene when three + the container are ready. A
  // topology change (tree / granularity → different point count) rebuilds geometry;
  // pure restyle (preset / cross-filter) only rewrites attributes (see below).
  $effect(() => {
    void THREE
    void ready
    if (!THREE || !containerEl || webglFailed || store.cloudStatus !== 'ready') return
    if (!sc) initScene()
  })

  function initScene(): void {
    if (!THREE || !containerEl) return
    const canvas = document.createElement('canvas')
    if (!webglAvailable(canvas)) {
      webglFailed = true
      return
    }
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
    const raycaster = new THREE.Raycaster()
    raycaster.params.Points = { threshold: 3 }

    // uBase is a base world-radius (≈4.5 units on the ±100 canvas); uScale is half the
    // DRAWING-BUFFER height (device px), so gl_PointSize comes out in real pixels with
    // depth attenuation. Both are (re)set in resize().
    const pointsMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uBase: { value: 4.5 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    })
    const linesMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18, color: 0x8aa0b2 })

    sc = {
      renderer,
      scene,
      camera,
      raycaster,
      pointsObj: null,
      pointsGeom: null,
      pointsMat,
      linesObj: null,
      linesGeom: null,
      linesMat,
      positions: new Float32Array(0),
      relax: null,
      count: 0,
      settled: true,
      raf: 0,
      dispose: () => {
        pointsMat.dispose()
        linesMat.dispose()
        sc?.pointsGeom?.dispose()
        sc?.linesGeom?.dispose()
        renderer.dispose()
        canvas.remove()
      },
    }
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    canvas.style.touchAction = 'none'
    // The accessible name + role live on the labelled container div (below), so a
    // screen reader exposes the honest description; a bare canvas role here would be
    // an unnamed image (ARIA does not expose aria-label on a role-less <div>).
    containerEl.replaceChildren(canvas)
    wireInteraction(canvas)
    resize()
    buildGeometry()
    loop()
  }

  // Topology rebuild: allocate the points + edges geometry for the current render set.
  function buildGeometry(): void {
    if (!THREE || !sc) return
    const pts = renderPoints
    const n = pts.length
    const positions = new Float32Array(n * 3)
    const anchors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      positions[i * 3] = anchors[i * 3] = pts[i].x
      positions[i * 3 + 1] = anchors[i * 3 + 1] = pts[i].y
      positions[i * 3 + 2] = anchors[i * 3 + 2] = pts[i].z
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('acolor', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    geom.setAttribute('asize', new THREE.BufferAttribute(new Float32Array(n), 1))
    geom.setAttribute('aalpha', new THREE.BufferAttribute(new Float32Array(n), 1))
    geom.computeBoundingSphere()

    // Edges (constellation): only meaningful at element granularity (indices reference
    // the embedding's element order); for the locus view we skip the overlay.
    let linesGeom: any = null
    let linesObj: any = null
    if (granularity === 'element' && activeTree) {
      const edges = activeTree.edges
      const ep = new Float32Array(edges.length * 6)
      for (let e = 0; e < edges.length; e++) {
        const [a, b] = edges[e]
        ep[e * 6] = positions[a * 3]
        ep[e * 6 + 1] = positions[a * 3 + 1]
        ep[e * 6 + 2] = positions[a * 3 + 2]
        ep[e * 6 + 3] = positions[b * 3]
        ep[e * 6 + 4] = positions[b * 3 + 1]
        ep[e * 6 + 5] = positions[b * 3 + 2]
      }
      linesGeom = new THREE.BufferGeometry()
      linesGeom.setAttribute('position', new THREE.BufferAttribute(ep, 3))
      linesObj = new THREE.LineSegments(linesGeom, sc.linesMat)
      linesObj.visible = constellation
    }

    // Swap in the new objects, disposing the old.
    sc.pointsGeom?.dispose()
    sc.linesGeom?.dispose()
    if (sc.pointsObj) sc.scene.remove(sc.pointsObj)
    if (sc.linesObj) sc.scene.remove(sc.linesObj)
    const pointsObj = new THREE.Points(geom, sc.pointsMat)
    pointsObj.frustumCulled = false
    sc.scene.add(pointsObj)
    if (linesObj) sc.scene.add(linesObj)

    sc.pointsObj = pointsObj
    sc.pointsGeom = geom
    sc.linesObj = linesObj
    sc.linesGeom = linesGeom
    sc.positions = positions
    sc.relax = createRelaxState(anchors)
    sc.count = n
    sc.settled = spread <= 0.001
    restyle()
  }

  // Restyle only: rewrite per-vertex color / size / alpha (no geometry rebuild),
  // exactly as PhyloTree separates topology-rebuild from styling-refresh.
  function restyle(): void {
    if (!sc || !sc.pointsGeom) return
    const pts = renderPoints
    const colAttr = sc.pointsGeom.getAttribute('acolor')
    const sizeAttr = sc.pointsGeom.getAttribute('asize')
    const alphaAttr = sc.pointsGeom.getAttribute('aalpha')
    if (!colAttr || pts.length !== sc.count) return
    const col = colAttr.array as Float32Array
    const size = sizeAttr.array as Float32Array
    const alpha = alphaAttr.array as Float32Array
    const locusBump = granularity === 'locus' ? 1.25 : 1
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const hex = pointColor(p, colorMode)
      const { r, g, b } = hexToRgb01(hex)
      const out = crossFiltered && !selectedTandemIds.has(p.tandem_id)
      const dim = out || (emphasizeNonFirm && p.phylum === 'Firmicutes')
      // dim toward, not to, zero so a dimmed point is still faintly placeable
      col[i * 3] = r
      col[i * 3 + 1] = g
      col[i * 3 + 2] = b
      size[i] = sizeFactor(p, sizeMode, { highlightNonFirmicutes: emphasizeNonFirm }) * locusBump * (dim ? 0.6 : 1)
      alpha[i] = dim ? 0.12 : 0.92
    }
    colAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
    alphaAttr.needsUpdate = true
    if (sc.linesObj) sc.linesObj.visible = constellation && granularity === 'element'
  }

  // Rebuild geometry when the point SET changes (tree / granularity).
  $effect(() => {
    void which
    void granularity
    if (sc) buildGeometry()
  })

  // Restyle when an encoding / cross-filter input changes (no rebuild).
  $effect(() => {
    void colorMode
    void sizeMode
    void emphasizeNonFirm
    void constellation
    void selectedTandemIds
    void crossFiltered
    if (sc) restyle()
  })

  // Spread changes wake the relax loop (so easing back to 0 actually runs).
  $effect(() => {
    void spread
    if (sc) sc.settled = false
  })

  function hexToRgb01(hex: string): { r: number; g: number; b: number } {
    let h = hex.replace('#', '')
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    }
  }

  // ── Render loop: relax + idle-rotate + draw ──────────────────────────────────────
  function loop(): void {
    if (!sc || !THREE) return
    if (typeof requestAnimationFrame === 'function') sc.raf = requestAnimationFrame(loop)
    const s = sc
    // Step the spread relaxation while not settled, then push positions to the GPU.
    if (s.relax && !s.settled) {
      step(s.relax, spread)
      s.positions.set(s.relax.positions)
      const posAttr = s.pointsGeom.getAttribute('position')
      posAttr.needsUpdate = true
      updateEdgePositions()
      if (spread <= 0.001 && maxAnchorOffset(s.relax) === 0) s.settled = true
      // throttle the honesty readout (~5/s)
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (now - lastOffsetTick > 180) {
        lastOffsetTick = now
        const mo = meanAnchorOffset(s.relax)
        if (Math.abs(mo - meanOffset) > 0.05) meanOffset = mo
      }
    }
    // Idle auto-rotation (off under reduced motion / after interaction).
    if (idleRotate && !reducedMotion) orbit = orbitRotate(orbit, 0.0016, 0)
    applyCamera()
    s.renderer.render(s.scene, s.camera)
  }

  function updateEdgePositions(): void {
    if (!sc || !sc.linesGeom || !activeTree) return
    const edges = activeTree.edges
    const ep = sc.linesGeom.getAttribute('position').array as Float32Array
    const P = sc.positions
    for (let e = 0; e < edges.length; e++) {
      const [a, b] = edges[e]
      ep[e * 6] = P[a * 3]
      ep[e * 6 + 1] = P[a * 3 + 1]
      ep[e * 6 + 2] = P[a * 3 + 2]
      ep[e * 6 + 3] = P[b * 3]
      ep[e * 6 + 4] = P[b * 3 + 1]
      ep[e * 6 + 5] = P[b * 3 + 2]
    }
    sc.linesGeom.getAttribute('position').needsUpdate = true
  }

  function applyCamera(): void {
    if (!sc) return
    const pos = cameraPosition(orbit)
    sc.camera.position.set(pos.x, pos.y, pos.z)
    sc.camera.lookAt(orbit.target.x, orbit.target.y, orbit.target.z)
  }

  function resize(): void {
    if (!sc || !containerEl) return
    const w = Math.max(containerEl.clientWidth || 800, 50)
    const h = Math.max(containerEl.clientHeight || 600, 50)
    sc.renderer.setSize(w, h, false)
    sc.camera.aspect = w / h
    sc.camera.updateProjectionMatrix()
    // gl_PointSize is in device pixels, so scale by the drawing-buffer height
    // (CSS height × pixel ratio), not the CSS height — otherwise points render
    // ~DPR× too small (near-invisible on a HiDPI display).
    const dpr = typeof sc.renderer.getPixelRatio === 'function' ? sc.renderer.getPixelRatio() : 1
    sc.pointsMat.uniforms.uScale.value = (h * dpr) / 2
  }

  // ── Pointer interaction (orbit / pan / zoom / hover / click) ─────────────────────
  function wireInteraction(canvas: HTMLCanvasElement): void {
    let dragging = false
    let panning = false
    let lastX = 0
    let lastY = 0
    let moved = 0

    canvas.addEventListener('pointerdown', (ev) => {
      dragging = true
      panning = ev.button === 1 || ev.shiftKey
      lastX = ev.clientX
      lastY = ev.clientY
      moved = 0
      idleRotate = false // auto-disable idle rotation on interaction
      try {
        canvas.setPointerCapture(ev.pointerId)
      } catch {
        /* jsdom / unsupported — ignore */
      }
    })
    canvas.addEventListener('pointermove', (ev) => {
      if (dragging) {
        const dx = ev.clientX - lastX
        const dy = ev.clientY - lastY
        lastX = ev.clientX
        lastY = ev.clientY
        moved += Math.abs(dx) + Math.abs(dy)
        if (panning) {
          const k = orbit.distance * 0.0016
          orbit = orbitPan(orbit, dx * k, dy * k)
        } else {
          orbit = orbitRotate(orbit, dx * 0.005, dy * 0.005)
        }
      } else {
        handleHover(ev, canvas)
      }
    })
    const endDrag = (ev: PointerEvent) => {
      if (dragging && moved < 4) handleClick(ev, canvas) // a tap, not a drag
      dragging = false
      try {
        canvas.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
    }
    canvas.addEventListener('pointerup', endDrag)
    canvas.addEventListener('pointerleave', () => hideTip())
    canvas.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault()
        idleRotate = false
        orbit = orbitZoom(orbit, ev.deltaY > 0 ? 1.1 : 0.9)
      },
      { passive: false },
    )
  }

  /** Raycast the points object; return the picked render-point index or -1. */
  function pick(ev: PointerEvent | MouseEvent, canvas: HTMLCanvasElement): number {
    if (!sc || !THREE || !sc.pointsObj) return -1
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -(((ev.clientY - rect.top) / rect.height) * 2 - 1),
    )
    sc.raycaster.setFromCamera(ndc, sc.camera)
    const hits = sc.raycaster.intersectObject(sc.pointsObj, false)
    return hits.length > 0 && hits[0].index != null ? hits[0].index : -1
  }

  function handleHover(ev: PointerEvent, canvas: HTMLCanvasElement): void {
    const i = pick(ev, canvas)
    if (i >= 0 && i < renderPoints.length) showTipFor(renderPoints[i], ev)
    else hideTip()
  }

  function handleClick(ev: PointerEvent | MouseEvent, canvas: HTMLCanvasElement): void {
    const i = pick(ev, canvas)
    if (i < 0 || i >= renderPoints.length) return
    const action = pointAction(renderPoints[i], selectable)
    if (action.kind === 'navigate') {
      push(`/locus/${action.tandem_id}`)
    } else if (action.kind === 'facet') {
      const cur = store.filter.specifier
      if (cur.size === 1 && cur.has(action.specifier)) store.clearFacet('specifier')
      else store.setFacet('specifier', [action.specifier])
    }
  }

  function resetView(): void {
    orbit = defaultOrbit()
  }

  // ── Resize observer (debounced, jsdom-guarded like PhyloTree) ────────────────────
  onMount(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerEl) {
      ro = new ResizeObserver(() => {
        clearTimeout(t)
        t = setTimeout(resize, 150)
      })
      ro.observe(containerEl)
    }
    return () => {
      clearTimeout(t)
      ro?.disconnect()
    }
  })

  const presetList = $derived(PRESET_ORDER.map((k) => PRESETS[k]))
</script>

<Card>
  {#snippet children()}
    <div class="flex flex-col gap-4 lg:flex-row">
      <!-- ── Left HUD: controls ───────────────────────────────────────────────── -->
      <div class="flex shrink-0 flex-col gap-4 lg:w-60">
        <fieldset class="flex flex-col gap-1.5">
          <legend class="text-small font-medium text-text">Tree</legend>
          <div class="inline-flex overflow-hidden rounded-md border border-hairline text-small">
            <button
              type="button"
              class="flex-1 px-2.5 py-1 {which === 'main' ? 'bg-brand text-white' : 'bg-surface text-text'}"
              aria-pressed={which === 'main'}
              onclick={() => (which = 'main')}>Main · Stem I</button
            >
            <button
              type="button"
              class="flex-1 border-l border-hairline px-2.5 py-1 {which === 'fallback' ? 'bg-brand text-white' : 'bg-surface text-text'}"
              aria-pressed={which === 'fallback'}
              onclick={() => (which = 'fallback')}>Fallback</button
            >
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-1.5">
          <legend class="flex items-center gap-1 text-small font-medium text-text">
            View <InfoTip label="View" tip="Locus shows one dot per locus (at the centroid of its elements); Element shows every T-box element separately, and enables the nearest-neighbour overlay." />
          </legend>
          <div class="inline-flex overflow-hidden rounded-md border border-hairline text-small">
            <button
              type="button"
              class="flex-1 px-2.5 py-1 {granularity === 'locus' ? 'bg-brand text-white' : 'bg-surface text-text'}"
              aria-pressed={granularity === 'locus'}
              onclick={() => (granularity = 'locus')}>Locus</button
            >
            <button
              type="button"
              class="flex-1 border-l border-hairline px-2.5 py-1 {granularity === 'element' ? 'bg-brand text-white' : 'bg-surface text-text'}"
              aria-pressed={granularity === 'element'}
              onclick={() => (granularity = 'element')}>Element</button
            >
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-1.5">
          <legend class="flex items-center gap-1 text-small font-medium text-text">
            Color preset <InfoTip label="Preset" tip="Vetted color + size encodings. Switch to Advanced to set color and size independently." />
          </legend>
          <div class="flex flex-col gap-1">
            {#each presetList as p (p.key)}
              <button
                type="button"
                class="rounded-md border px-2.5 py-1 text-left text-small {!advanced && presetKey === p.key ? 'border-brand bg-brand/10 text-ink' : 'border-hairline bg-surface text-text'}"
                aria-pressed={!advanced && presetKey === p.key}
                onclick={() => {
                  advanced = false
                  presetKey = p.key
                }}
                title={p.blurb}>{p.label}</button
              >
            {/each}
            <button
              type="button"
              class="rounded-md border px-2.5 py-1 text-left text-small {advanced ? 'border-brand bg-brand/10 text-ink' : 'border-hairline bg-surface text-text'}"
              aria-pressed={advanced}
              onclick={() => (advanced = !advanced)}>Advanced…</button
            >
          </div>
          {#if advanced}
            <div class="mt-1 flex flex-col gap-2 rounded-md border border-hairline bg-surface-subtle p-2 text-small">
              <label class="flex items-center justify-between gap-2">
                Color
                <select bind:value={advColor} class="rounded border border-hairline bg-surface px-1 py-0.5">
                  <option value="specifier">Specifier</option>
                  <option value="ddg">ΔΔG</option>
                  <option value="func">Function</option>
                  <option value="conf">Confidence</option>
                  <option value="type">Type</option>
                  <option value="phylum">Phylum</option>
                </select>
              </label>
              <label class="flex items-center justify-between gap-2">
                Size
                <select bind:value={advSize} class="rounded border border-hairline bg-surface px-1 py-0.5">
                  <option value="uniform">Uniform</option>
                  <option value="absDdg">|ΔΔG|</option>
                  <option value="divergence">Divergence</option>
                </select>
              </label>
            </div>
          {/if}
        </fieldset>

        <div class="flex flex-col gap-1.5">
          <label for="cloud-spread" class="flex items-center gap-1 text-small font-medium text-text">
            Spread <InfoTip label="Spread" tip="De-piles the crowded core for clickability by repelling nearby points, while springing each toward its true position. 0 = exact distances; higher = more readable but inflated. Fully reversible." />
            <span class="ml-auto font-mono text-muted">{spread.toFixed(2)}</span>
          </label>
          <input
            id="cloud-spread"
            type="range"
            min="0"
            max="1"
            step="0.02"
            bind:value={spread}
            class="accent-brand"
          />
        </div>

        <div class="flex flex-col gap-1.5 text-small text-text">
          <label class="flex items-center gap-2">
            <input type="checkbox" bind:checked={constellation} class="accent-brand" disabled={granularity !== 'element'} />
            Constellation
            <InfoTip label="Constellation" tip="Overlay each element's two nearest neighbours (by sequence distance) as faint links. Available in the Element view." />
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" bind:checked={highlightNonFirm} class="accent-brand" />
            Highlight non-Firmicutes
            <InfoTip label="Highlight non-Firmicutes" tip="Emphasize the non-Firmicutes minority (by size, not color alone) and dim the Firmicutes majority." />
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" bind:checked={idleRotate} class="accent-brand" disabled={reducedMotion} />
            Idle rotation
            {#if reducedMotion}<span class="text-caption text-muted">(off · reduced motion)</span>{/if}
          </label>
        </div>

        <button
          type="button"
          class="rounded-md border border-hairline bg-surface px-2.5 py-1 text-small text-text hover:border-brand"
          onclick={resetView}>Reset view</button
        >
      </div>

      <!-- ── Canvas + honesty readouts ────────────────────────────────────────── -->
      <div class="min-w-0 flex-1">
        <div
          class="relative w-full overflow-hidden rounded-md border border-hairline bg-ink/95"
          style:height
        >
          <div
            bind:this={containerEl}
            class="h-full w-full"
            role="img"
            aria-label="3D Stem I similarity cloud — an exploratory, unrooted embedding; {tipCount} {granularity === 'locus' ? 'loci' : 'elements'} positioned by sequence similarity, not ancestry."
          ></div>
          {#if !ready}
            <div class="absolute inset-0 grid place-items-center bg-surface">
              {#if store.cloudStatus === 'error'}
                <p class="max-w-measure px-6 text-center text-small text-muted">
                  The similarity-cloud data could not be loaded. The
                  <a href="#/tree" class="text-brand underline">2D similarity map</a> and the locus detail pages remain available.
                </p>
              {:else if webglFailed}
                <p class="max-w-measure px-6 text-center text-small text-muted">
                  This browser can't display the 3D cloud (WebGL unavailable). The
                  <a href="#/tree" class="text-brand underline">2D similarity map</a> shows the same Stem I relationships.
                </p>
              {:else}
                <Spinner label="Loading the 3D similarity cloud…" />
              {/if}
            </div>
          {/if}
        </div>

        <!-- Honest readouts (PLAN §6.5) — always visible -->
        <p class="mt-2 text-small text-text">
          <span class="font-medium">{tipCount}</span>
          {granularity === 'locus' ? 'loci' : 'elements'} ·
          3 PCoA axes capture <span class="font-medium">{pct3D}%</span> of pairwise distance
          <span class="text-muted">(a flat 2D layout: {pct2D}%)</span>
          {#if crossFiltered}<span class="text-brand"> · cross-filtered to {selectedTandemIds.size} loci</span>{/if}
        </p>
        {#if spread > 0.001}
          <p class="mt-1 text-caption text-muted">
            ⚠ Positions inflated for clarity — mean offset
            <span class="font-mono">{meanOffset.toFixed(1)}</span> units from true position. Set spread to 0 for true distances.
          </p>
        {/if}
        <p class="mt-1 max-w-measure text-caption text-muted">
          A navigation aid for spotting structure — not a measurement instrument. Distances are an
          imperfect 3D projection; the locus detail pages are the source of truth. Drag to orbit,
          scroll to zoom, shift-drag to pan; hover a point for its locus;
          {selectable ? 'click to filter the dashboard by its specifier.' : 'click to open its detail page.'}
        </p>
      </div>
    </div>
  {/snippet}
</Card>

{#if tip.visible}
  <div
    class="pointer-events-none fixed z-50 rounded-md border border-hairline bg-ink px-2.5 py-1.5 text-caption text-white shadow-md"
    style:left="{tip.x}px"
    style:top="{tip.y}px"
  >
    {#each tip.lines as line, i (i)}
      <div class={i === 0 ? 'font-medium' : 'text-chrome-fg'}>{line}</div>
    {/each}
  </div>
{/if}
