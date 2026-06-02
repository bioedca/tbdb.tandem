<script lang="ts">
  // Feature-highlighted member sequences (PLAN §9 detail flow, after the element
  // comparison). Each member's gap-free leader (`fasta_sequence`) is rendered in
  // mono with its Stem-I, specifier codon, antiterminator, terminator, and
  // discriminator spans highlighted. The visual language mirrors the architecture
  // diagram (§9①), so it inherits the already-cleared §8.2 chrome⟂data invariant:
  //   • Stem-I / specifier-codon "fill" = the element's OWN specifier hue (data
  //     colour, exactly like the diagram body tint), the codon stronger + bold;
  //   • the 3′ regulatory features use NEUTRAL chrome only — terminator a solid ink
  //     rule, discriminator a dotted muted rule, antiterminator a dashed muted
  //     underline (matching the diagram's hairpin = ink, discrim/antiterm = muted).
  // The pure segmentation lives in `sequence.ts` (unit-tested at S2.7).
  import type { Member } from '../data/types'
  import { aaColor, withAlpha } from '../color'
  import { neutral } from '../design/tokens'
  import {
    buildSequenceSegments,
    presentFeatures,
    FEATURE_LABEL,
    type HighlightFeature,
    type SeqSegment,
  } from '../sequence'

  let { members }: { members: Member[] } = $props()

  const els = $derived([...members].sort((a, b) => a.ordinal - b.ordinal))

  function ordinalLabel(ordinal: number, n: number): string {
    if (ordinal === 1) return '5′ (1)'
    if (ordinal === n) return `3′ (${ordinal})`
    return `mid (${ordinal})`
  }

  /** Inline style for one segment: specifier-tint fill (data) + neutral chrome rules. */
  function segStyle(seg: SeqSegment, tint: string): string {
    const parts: string[] = []
    if (seg.fill === 'codon') parts.push(`background:${withAlpha(tint, 0.45)}`, 'font-weight:700')
    else if (seg.fill === 's1') parts.push(`background:${withAlpha(tint, 0.13)}`)
    if (seg.rule === 'term') parts.push(`border-bottom:2px solid ${neutral.ink}`)
    else if (seg.rule === 'discrim') parts.push(`border-bottom:2px dotted ${neutral.muted}`)
    if (seg.underline === 'antiterm') {
      parts.push(
        `text-decoration:underline dashed ${neutral.muted}`,
        'text-underline-offset:3px',
      )
    }
    return parts.join(';')
  }

  interface MemberView {
    member: Member
    segments: SeqSegment[]
    present: HighlightFeature[]
    tint: string
  }
  const views = $derived<MemberView[]>(
    els.map((member) => ({
      member,
      segments: buildSequenceSegments(member),
      present: presentFeatures(member),
      tint: aaColor(member.specifier.aa),
    })),
  )

  // Legend rows shown once for the section (the fill samples are tinted per element
  // at render; here a neutral placeholder conveys the style, not a specifier).
  const LEGEND: { feature: HighlightFeature; sample: string }[] = [
    { feature: 's1', sample: `background:${withAlpha(neutral.muted, 0.18)}` },
    { feature: 'codon', sample: `background:${withAlpha(neutral.muted, 0.42)};font-weight:700` },
    { feature: 'antiterm', sample: `text-decoration:underline dashed ${neutral.muted};text-underline-offset:3px` },
    { feature: 'term', sample: `border-bottom:2px solid ${neutral.ink}` },
    { feature: 'discrim', sample: `border-bottom:2px dotted ${neutral.muted}` },
  ]
</script>

<div class="space-y-4">
  <!-- Legend (style → feature). Fill samples are specifier-tinted per element. -->
  <ul class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted">
    {#each LEGEND as item (item.feature)}
      <li class="inline-flex items-center gap-1.5">
        <span class="font-mono text-ink" style={item.sample}>ACGT</span>
        <span>{FEATURE_LABEL[item.feature]}</span>
      </li>
    {/each}
    <li class="text-muted">· fill tinted by specifier</li>
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
      <p class="tv-seq rounded-md border border-hairline bg-surface-subtle p-2.5">
        {#each v.segments as seg (seg.start)}<span
            style={segStyle(seg, v.tint)}
            title={[
              seg.fill === 'codon' ? FEATURE_LABEL.codon : seg.fill === 's1' ? FEATURE_LABEL.s1 : null,
              seg.rule ? FEATURE_LABEL[seg.rule] : null,
              seg.underline ? FEATURE_LABEL.antiterm : null,
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
