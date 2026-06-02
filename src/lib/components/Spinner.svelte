<script lang="ts">
  // Loading spinner (PLAN §8.5). role="status" + visually-hidden label so the
  // loading state is announced; under prefers-reduced-motion the global rule in
  // app.css freezes the rotation (the label still conveys "loading").
  let {
    size = 20,
    label = 'Loading…',
  }: {
    size?: number
    label?: string
  } = $props()
</script>

<span role="status" class="inline-flex items-center gap-2 text-small text-muted">
  <svg
    class="tv-spin"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="var(--color-brand)"
      stroke-width="3"
      stroke-linecap="round"
    />
  </svg>
  <span class="sr-only">{label}</span>
</span>

<style>
  .tv-spin {
    animation: tv-spin 0.7s linear infinite;
  }
  @keyframes tv-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
