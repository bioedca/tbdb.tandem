<script lang="ts">
  // Primary / ghost button (PLAN §8.5). Primary = brand fill; ghost = hairline
  // outline. Motion is brief (§8.4) and neutralized under prefers-reduced-motion
  // by the global rule in app.css. Focus ring comes from the global :focus-visible.
  import type { Snippet } from 'svelte'

  let {
    variant = 'primary',
    type = 'button',
    disabled = false,
    title,
    onclick,
    children,
    class: klass = '',
  }: {
    variant?: 'primary' | 'ghost'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    title?: string
    onclick?: (e: MouseEvent) => void
    children?: Snippet
    class?: string
  } = $props()

  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-small font-medium ' +
    'transition-colors duration-200 ease-standard disabled:cursor-not-allowed disabled:opacity-50'
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-strong',
    ghost: 'border border-hairline bg-surface text-body hover:bg-surface-subtle',
  } as const
</script>

<button {type} {disabled} {title} {onclick} class="{base} {variants[variant]} {klass}">
  {@render children?.()}
</button>
