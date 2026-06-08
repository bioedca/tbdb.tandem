import { onFontsReady } from './text/measure'

export interface BoxSize {
  w: number
  h: number
}

export function elementSize(node: HTMLElement | null | undefined): BoxSize {
  if (!node) return { w: 0, h: 0 }
  return { w: node.clientWidth || 0, h: node.clientHeight || 0 }
}

export function observeElementSize(
  node: HTMLElement | null | undefined,
  cb: (size: BoxSize) => void,
  opts: { delay?: number; fontsReady?: boolean } = {},
): () => void {
  if (!node) return () => {}
  const delay = opts.delay ?? 150
  let last: BoxSize = { w: -1, h: -1 }
  let timer: ReturnType<typeof setTimeout> | undefined

  const emit = (size = elementSize(node), force = false) => {
    if (!force && Math.abs(size.w - last.w) < 0.5 && Math.abs(size.h - last.h) < 0.5) return
    last = size
    cb(size)
  }

  emit()
  if (opts.fontsReady) onFontsReady(() => emit(undefined, true))

  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      const size = rect ? { w: rect.width, h: rect.height } : elementSize(node)
      clearTimeout(timer)
      timer = setTimeout(() => emit(size), delay)
    })
    ro.observe(node)
  }

  return () => {
    clearTimeout(timer)
    ro?.disconnect()
  }
}
