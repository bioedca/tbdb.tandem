<script module lang="ts">
  // The EXACT no-polarity banner text (PLAN §6, §8.1). This is a hard lab
  // standard and a ship gate (§13) — exported so the S3.2 label review and tests
  // assert against one source of truth. Do NOT add ancestry/direction language.
  export const NO_POLARITY_BANNER_TEXT =
    'Exploratory similarity map, unrooted; branch positions reflect sequence similarity, not ancestry.'
</script>

<script lang="ts">
  // Persistent low-chrome banner (PLAN §8.5) mounted on /tree at S3.2. Neutral,
  // quiet, informational — never an alert.
</script>

<div
  role="note"
  class="flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2 text-small text-muted"
>
  <svg viewBox="0 0 16 16" class="size-4 shrink-0 text-brand" aria-hidden="true">
    <circle cx="8" cy="8" r="6.75" stroke="currentColor" stroke-width="1.3" fill="none" />
    <path d="M8 7.25V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    <circle cx="8" cy="5" r="0.9" fill="currentColor" />
  </svg>
  <span>{NO_POLARITY_BANNER_TEXT}</span>
</div>
