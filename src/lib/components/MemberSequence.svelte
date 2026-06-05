<script lang="ts">
  // Feature-highlighted member sequences (PLAN §9 detail flow, after the element
  // comparison). Each member's gap-free leader (`fasta_sequence`) is rendered in
  // mono with its STEM CLASSIFICATION painted as the background fill — the SAME
  // `member.stems` + `STEM_COLORS` the in-app RNA (RnaStructure) uses, so the
  // sequence and the 2D structure read the same color language base-for-base:
  //   • Stem I / II / IIA-B / III / antiterminator "fill" = the stem's overlay tint
  //     (a quiet, muted register; linkers stay unfilled = white);
  //   • the specifier codon (which sits inside Stem-I) is bolded over a deeper tint;
  //   • the 3′ regulatory features that are NOT stems stay NEUTRAL chrome rules — the
  //     terminator a solid ink bottom-rule, the discriminator a dotted muted one.
  // The per-element identity swatch keeps the specifier (amino-acid) data hue, exactly
  // like the RNA viewer's element tabs. The pure segmentation lives in `sequence.ts`.
  import type { Member, StemKey } from '../data/types'
  import { aaColor, STEM_COLORS, STEM_META, withAlpha } from '../color'
  import { neutral } from '../design/tokens'
  import {
    buildSequenceSegments,
    presentMarkers,
    FEATURE_LABEL,
    MARKER_FEATURES,
    type MarkerFeature,
    type SeqSegment,
  } from '../sequence'

  let { members }: { members: Member[] } = $props()

  const els = $derived([...members].sort((a, b) => a.ordinal - b.ordinal))

  function ordinalLabel(ordinal: number, n: number): string {
    if (ordinal === 1) return '5′ (1)'
    if (ordinal === n) return `3′ (${ordinal})`
    return `mid (${ordinal})`
  }

  /** Inline style for one segment: the stem tint (matching the in-app RNA), with the
   *  codon bolded over a deeper tint and the 3′ rules as neutral bottom-borders. */
  function segStyle(seg: SeqSegment): string {
    const parts: string[] = []
    if (seg.codon) {
      // The codon sits inside Stem-I → a deeper version of its stem tint (ink tint if
      // a degenerate element carries the codon window but no stem), bold, and an ink
      // ring so it reads as a discrete mark over the lighter stem fill (echoing the
      // architecture diagram's ink codon tick), not just a slightly darker patch.
      const base = seg.stem ? STEM_COLORS[seg.stem] : neutral.ink
      parts.push(
        `background:${withAlpha(base, seg.stem ? 0.85 : 0.22)}`,
        'font-weight:700',
        `box-shadow:inset 0 0 0 1px ${withAlpha(neutral.ink, 0.55)}`,
        'border-radius:2px',
      )
    } else if (seg.stem) {
      parts.push(`background:${withAlpha(STEM_COLORS[seg.stem], 0.55)}`)
    }
    if (seg.rule === 'term') parts.push(`border-bottom:2px solid ${neutral.ink}`)
    else if (seg.rule === 'discrim') parts.push(`border-bottom:2px dotted ${neutral.muted}`)
    return parts.join(';')
  }

  interface MemberView {
    member: Member
    segments: SeqSegment[]
    tint: string
  }
  const views = $derived<MemberView[]>(
    els.map((member) => ({
      member,
      segments: buildSequenceSegments(member),
      tint: aaColor(member.specifier.aa),
    })),
  )

  // Section legend = the UNION of stems + markers actually present across the
  // elements, in canonical 5′→3′ order — the same stem color key the RNA viewer shows.
  const legendStems = $derived.by(() => {
    const present = new Set<StemKey>()
    for (const m of els) for (const s of m.stems ?? []) present.add(s.key)
    return STEM_META.filter((s) => present.has(s.key))
  })
  const legendMarkers = $derived.by(() => {
    const present = new Set<MarkerFeature>()
    for (const m of els) for (const f of presentMarkers(m)) present.add(f)
    return MARKER_FEATURES.filter((f) => present.has(f))
  })

  /** Inline sample style for a marker legend chip (mirrors `segStyle`). */
  const MARKER_SAMPLE: Record<MarkerFeature, string> = {
    codon: `background:${withAlpha(STEM_COLORS.i, 0.85)};font-weight:700;box-shadow:inset 0 0 0 1px ${withAlpha(neutral.ink, 0.55)};border-radius:2px`,
    term: `border-bottom:2px solid ${neutral.ink}`,
    discrim: `border-bottom:2px dotted ${neutral.muted}`,
  }
</script>

<div class="space-y-4">
  <!-- Legend (color → feature) — the stem color key (matching the RNA viewer) plus
       the codon / terminator / discriminator markers actually present. -->
  <ul class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted">
    {#each legendStems as s (s.key)}
      <li class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-sm ring-1 ring-ink/10" style:background={s.color} aria-hidden="true"></span>
        <span>{s.label}</span>
      </li>
    {/each}
    {#each legendMarkers as f (f)}
      <li class="inline-flex items-center gap-1.5">
        <span class="rounded-xs px-0.5 font-mono text-ink" style={MARKER_SAMPLE[f]}>ACG</span>
        <span>{FEATURE_LABEL[f]}</span>
      </li>
    {/each}
    <li class="text-muted">· stems colored as in the RNA structure</li>
  </ul>

  {#each views as v (v.member.member_id)}
    <div class="space-y-1.5" data-member={v.member.member_id}>
      <!-- Member identity header (ordinal · specifier · unique_name · length · downstream) -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
        <span class="font-mono text-caption font-medium text-muted">{ordinalLabel(v.member.ordinal, els.length)}</span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-3 rounded-sm ring-1 ring-ink/10" style:background={v.tint} aria-hidden="true"></span>
          <span class="font-mono font-medium text-ink">{v.member.specifier.aa ?? '?'}</span>
          {#if v.member.specifier.codon}<span class="font-mono text-caption text-muted">{v.member.specifier.codon}</span>{/if}
        </span>
        {#if v.member.unique_name}
          <span class="font-mono text-caption text-muted">{v.member.unique_name}</span>
        {/if}
        <span class="font-mono text-caption text-muted">{v.member.fasta_sequence.length} nt</span>
        {#if v.member.downstream.protein}
          <span class="text-caption text-muted">· {v.member.downstream.protein}</span>
        {/if}
      </div>

      <!-- The leader, segmented and highlighted (wraps; mono so the bases align). -->
      <p class="tv-seq rounded-md border border-hairline bg-surface p-2.5">
        {#each v.segments as seg (seg.start)}<span
            style={segStyle(seg)}
            title={[
              seg.stem ? STEM_META.find((s) => s.key === seg.stem)?.label : null,
              seg.codon ? FEATURE_LABEL.codon : null,
              seg.rule ? FEATURE_LABEL[seg.rule] : null,
            ]
              .filter(Boolean)
              .join(' · ') || undefined}>{seg.text}</span
          >{/each}
      </p>
    </div>
  {/each}
</div>

<style>
  /* Mono so every base is one fixed-width column; wraps on any character because a
     leader runs ~200–600 nt. Tight tracking keeps long sequences compact. */
  .tv-seq {
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.7;
    letter-spacing: 0.02em;
    word-break: break-all;
    overflow-wrap: anywhere;
    color: var(--color-ink);
  }
</style>
