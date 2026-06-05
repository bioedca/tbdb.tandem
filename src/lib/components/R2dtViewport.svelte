<script lang="ts">
  // R2dtViewport — the interactive scaling layer around the (pure presentational)
  // R2dtDiagram (PLAN §9). It exists because a fixed-height box + "fit the whole
  // molecule" makes long structures render with sub-pixel letters on desktop. This
  // wrapper measures its own on-screen pixel box and lets the reader:
  //   • see the whole structure by default (fit),
  //   • wheel-zoom (toward the cursor) and drag-pan to read any region,
  //   • get letters automatically once the on-screen glyph is large enough — at ANY
  //     molecule length / figure size / device (replacing R2dtDiagram's blunt n≤360 cut).
  // Zoom is done by NARROWING the SVG viewBox R2dtDiagram draws into: glyph/stroke sizes
  // are set in diagram units, so they grow on screen as the window narrows and stay crisp
  // (no raster blur). Everything is additive over R2dtDiagram via two optional props, so
  // the shared drawing/colouring component is untouched. Honors prefers-reduced-motion by
  // never animating (zoom/pan are instant, user-driven).
  import type { MemberStem } from '../data/types'
  import type { OverlayFeature } from '../color'
  import type { R2dtDiagram as R2dtDiagramData } from '../r2dt'
  import { diagramViewBox, nucleotideSpacing } from '../r2dt'
  import R2dtDiagram from './R2dtDiagram.svelte'

  let {
    diagram,
    stems = [],
    features = [],
    variant = 'antiterm',
  }: {
    diagram: R2dtDiagramData
    stems?: MemberStem[]
    features?: OverlayFeature[]
    variant?: 'antiterm' | 'terminator'
  } = $props()

  // Smallest on-screen font (CSS px) at which letters stay legible; below it the diagram
  // reads by color + shape only (R2dtDiagram's old intent, but now size-driven).
  const LETTER_MIN_PX = 6.5
  // Cap the zoom where one nucleotide spans ~this many CSS px (comfortably readable); the
  // ceiling thus adapts to molecule size + device — a short molecule needs little zoom.
  const TARGET_NT_PX = 26

  let host = $state<HTMLDivElement | null>(null)
  let cw = $state(0) // measured CSS px (0 under SSR/jsdom → graceful: full-fit, heuristic letters)
  let ch = $state(0)
  let zoom = $state(1) // 1 = fit the whole molecule; grows toward maxZoom
  let cxv = $state(0) // view-centre in DIAGRAM coords (set to the box centre on each molecule)
  let cyv = $state(0)
  let dragging = $state(false)
  let lastX = 0
  let lastY = 0

  const box = $derived(diagramViewBox(diagram)) // [minX, minY, w, h]
  const spacing = $derived(nucleotideSpacing(diagram))

  // Reset the view whenever the molecule changes (new element / conformation).
  $effect(() => {
    void diagram
    zoom = 1
    cxv = box[0] + box[2] / 2
    cyv = box[1] + box[3] / 2
  })

  const viewW = $derived(box[2] / zoom)
  const viewH = $derived(box[3] / zoom)
  // Clamp the centre so the window never leaves the molecule's bounding box (when the
  // window is larger than the box on an axis, lock to the box centre on that axis).
  const cx = $derived(
    viewW >= box[2] ? box[0] + box[2] / 2 : clamp(cxv, box[0] + viewW / 2, box[0] + box[2] - viewW / 2),
  )
  const cy = $derived(
    viewH >= box[3] ? box[1] + box[3] / 2 : clamp(cyv, box[1] + viewH / 2, box[1] + box[3] - viewH / 2),
  )
  const displayViewBox = $derived(`${cx - viewW / 2} ${cy - viewH / 2} ${viewW} ${viewH}`)

  // px-per-diagram-unit under preserveAspectRatio="meet" (the limiting ratio).
  const scale = $derived(cw > 0 && ch > 0 ? Math.min(cw / viewW, ch / viewH) : 0)
  // Size-aware letters: shown once the on-screen glyph is big enough. null when unmeasured
  // (SSR/jsdom) → R2dtDiagram falls back to its length heuristic, keeping tests stable.
  const smartLetters = $derived<boolean | null>(scale > 0 ? spacing * 0.62 * scale >= LETTER_MIN_PX : null)
  const fitScale = $derived(cw > 0 && ch > 0 ? Math.min(cw / box[2], ch / box[3]) : 0)
  const maxZoom = $derived(fitScale > 0 ? clamp(TARGET_NT_PX / (spacing * fitScale), 1, 40) : 1)
  const canZoom = $derived(maxZoom > 1.02)

  /** Constrain `v` to the inclusive range [lo, hi]. */
  function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v))
  }

  /** Diagram coords under a host-relative pixel, for the CURRENT view (accounts for the
   *  meet letterbox so wheel-zoom keeps the point under the cursor fixed). */
  function diagramAt(px: number, py: number): [number, number] {
    const s = Math.min(cw / viewW, ch / viewH)
    const offX = (cw - viewW * s) / 2
    const offY = (ch - viewH * s) / 2
    return [cx - viewW / 2 + (px - offX) / s, cy - viewH / 2 + (py - offY) / s]
  }

  /** Zoom by `factor`, keeping the diagram point under (clientX, clientY) fixed (cursor
   *  zoom). When no point is given, zooms about the current centre. */
  function zoomBy(factor: number, clientX?: number, clientY?: number): void {
    const next = clamp(zoom * factor, 1, maxZoom)
    if (next === zoom) return
    if (clientX != null && clientY != null && host && scale > 0) {
      const rect = host.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      const [dx, dy] = diagramAt(px, py)
      zoom = next
      const nW = box[2] / zoom
      const nH = box[3] / zoom
      const nS = Math.min(cw / nW, ch / nH)
      const noffX = (cw - nW * nS) / 2
      const noffY = (ch - nH * nS) / 2
      cxv = dx + nW / 2 - (px - noffX) / nS
      cyv = dy + nH / 2 - (py - noffY) / nS
    } else {
      zoom = next
    }
  }

  /** Return the view to fit-the-whole-molecule (zoom 1, centred on the bounding box). */
  function reset(): void {
    zoom = 1
    cxv = box[0] + box[2] / 2
    cyv = box[1] + box[3] / 2
  }

  /** Action: track the host's CSS pixel box (cw/ch) via a guarded ResizeObserver — absent
   *  under jsdom/SSR, exactly like lib/actions/fitText.ts, so when it can't measure, cw/ch
   *  stay 0 and the view degrades to a plain full-fit with heuristic letters (no throw). */
  function measure(node: HTMLElement) {
    const update = () => {
      cw = node.clientWidth
      ch = node.clientHeight
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(node)
    return {
      destroy() {
        ro.disconnect()
      },
    }
  }

  /** Action: wheel-to-zoom via a non-passive listener so the page never scrolls while
   *  zooming (Svelte's declarative onwheel can't preventDefault reliably). Only active when
   *  there is room to zoom; otherwise the wheel scrolls the page as usual. */
  function wheelZoom(node: HTMLElement) {
    const onWheel = (e: WheelEvent) => {
      if (!canZoom) return
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return {
      destroy() {
        node.removeEventListener('wheel', onWheel)
      },
    }
  }

  /** Begin a drag-pan on a primary-button press (only when zoomed in, where panning means
   *  something); capture the pointer so the drag survives leaving the element. */
  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || zoom <= 1) return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    host?.setPointerCapture(e.pointerId)
  }
  /** While dragging, translate the view centre by the pointer delta (converted px→diagram
   *  units via the current scale); the derived `cx`/`cy` clamp it inside the molecule. */
  function onPointerMove(e: PointerEvent): void {
    if (!dragging || scale <= 0) return
    cxv = cx - (e.clientX - lastX) / scale
    cyv = cy - (e.clientY - lastY) / scale
    lastX = e.clientX
    lastY = e.clientY
  }
  /** End the drag-pan and release the pointer capture. */
  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return
    dragging = false
    host?.releasePointerCapture?.(e.pointerId)
  }

  /** Keyboard control (WCAG 2.1 AA: the pointer zoom/pan must have a keyboard equivalent):
   *  +/- zoom, 0 resets, arrows pan. Only active where there is room to zoom. */
  function onKeyDown(e: KeyboardEvent): void {
    if (!canZoom) return
    const panStep = viewW * 0.12
    switch (e.key) {
      case '+':
      case '=':
        zoomBy(1.4)
        break
      case '-':
      case '_':
        if (zoom > 1.01) zoomBy(1 / 1.4)
        break
      case '0':
        reset()
        break
      case 'ArrowLeft':
        cxv = cx - panStep
        break
      case 'ArrowRight':
        cxv = cx + panStep
        break
      case 'ArrowUp':
        cyv = cy - panStep
        break
      case 'ArrowDown':
        cyv = cy + panStep
        break
      default:
        return
    }
    e.preventDefault()
  }

  const zoomPct = $derived(Math.round(zoom * 100))
</script>

<!-- A pan/zoom surface has no exact ARIA widget role; it is keyboard-operable (onkeydown)
     AND has labelled zoom buttons, and the data is also in the accessible sequence view +
     element table — so suppress the static/non-interactive a11y rules that can't model it. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={host}
  use:measure
  use:wheelZoom
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={onPointerUp}
  onkeydown={onKeyDown}
  role="application"
  aria-label="Interactive RNA structure — scroll or +/− to zoom, drag or arrow keys to pan, 0 to reset"
  tabindex={canZoom ? 0 : -1}
  class="relative h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
  class:cursor-grab={canZoom && zoom <= 1}
  class:cursor-grabbing={dragging}
  class:cursor-move={canZoom && zoom > 1 && !dragging}
  style:touch-action={canZoom ? 'none' : 'auto'}
>
  <R2dtDiagram
    {diagram}
    {stems}
    {features}
    {variant}
    viewBoxOverride={displayViewBox}
    lettersOverride={smartLetters}
  />

  {#if canZoom}
    <!-- Zoom controls (keyboard-accessible). Hidden when the molecule already fits with
         readable glyphs, so they never clutter the common case. -->
    <div class="absolute bottom-1.5 right-1.5 flex items-center gap-1">
      {#if zoom > 1.02}
        <span
          class="rounded-sm bg-surface/85 px-1 py-0.5 text-caption tabular-nums text-muted ring-1 ring-hairline"
          aria-hidden="true">{zoomPct}%</span
        >
      {/if}
      <div class="flex flex-col overflow-hidden rounded-md ring-1 ring-hairline">
        <button
          type="button"
          title="Zoom in"
          aria-label="Zoom in"
          class="grid size-6 place-items-center bg-surface/85 text-ink transition-colors hover:bg-brand-subtle disabled:opacity-40"
          disabled={zoom >= maxZoom - 0.01}
          onclick={() => zoomBy(1.4)}>+</button
        >
        <button
          type="button"
          title="Zoom out / reset"
          aria-label="Zoom out"
          class="grid size-6 place-items-center border-t border-hairline bg-surface/85 text-ink transition-colors hover:bg-brand-subtle disabled:opacity-40"
          disabled={zoom <= 1.01}
          onclick={() => (zoom <= 1.01 ? reset() : zoomBy(1 / 1.4))}>−</button
        >
      </div>
      {#if zoom > 1.02}
        <button
          type="button"
          title="Reset zoom"
          aria-label="Reset zoom"
          class="grid size-6 place-items-center rounded-md bg-surface/85 text-muted ring-1 ring-hairline transition-colors hover:bg-brand-subtle hover:text-ink"
          onclick={reset}
        >
          <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M2 6V2.5h3.5M14 10v3.5h-3.5M14 6V2.5h-3.5M2 10v3.5h3.5" stroke-linecap="round" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</div>
