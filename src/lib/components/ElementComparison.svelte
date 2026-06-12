<script lang="ts">
  // Element-comparison panel (PLAN §9①, "Below it, an element-comparison panel").
  // Side-by-side per-element specifier/codon, tRNA family, ΔΔG and terminator-energy
  // as in-cell bars, completeness dots, per-element tbdb/NCBI deep-links — plus the
  // intra-locus pairwise %-identity (read from identity.json, grouped per locus by
  // the caller). The in-cell bars are CHROME magnitudes (brand/slate), never a
  // specifier hue, so the §8.2 chrome⟂data invariant holds; specifier colour stays
  // on the swatch. The 44 collapse-recovered loci share one leader window, so their
  // leader %-identity saturates at 100 (PROGRESS S0.5) — flagged here, not silently
  // shown as element-vs-element divergence.
  import type { IdentityPair, Member } from '../data/types'
  import { aaColor } from '../color'
  import { sharesLeader } from '../architecture'
  import { ordinalLabel } from '../sequence'
  import InfoTip from './InfoTip.svelte'
  import TbdbLink from './TbdbLink.svelte'

  let { members, pairs = [] }: { members: Member[]; pairs?: IdentityPair[] } = $props()

  const els = $derived([...members].sort((a, b) => a.ordinal - b.ordinal))
  const byId = $derived(new Map(members.map((m) => [m.member_id, m])))

  // In-cell bar domains (clamped). ΔΔG / terminator-energy are negative (more
  // negative = more stable); the bar fills toward the floor.
  const DDG_FLOOR = -28
  const TERME_FLOOR = -80

  function frac(value: number | null, floor: number): number {
    if (value === null) return 0
    return Math.max(0, Math.min(1, value / floor))
  }
  function num(value: number | null): string {
    return value === null ? '–' : value.toFixed(1)
  }

  interface PairRow {
    /** member_ids — the keyed-each key (globally unique; the human label is not). */
    a: string
    b: string
    label: string
    identity: number
    sharedLeader: boolean
  }
  const pairRows = $derived.by<PairRow[]>(() => {
    const n = els.length
    return pairs.map((p) => {
      const a = byId.get(p.a)
      const b = byId.get(p.b)
      const la = a ? ordinalLabel(a.ordinal, n).replace(/ \(.*/, '') : p.a
      const lb = b ? ordinalLabel(b.ordinal, n).replace(/ \(.*/, '') : p.b
      return {
        a: p.a,
        b: p.b,
        label: `${la} ↔ ${lb}`,
        identity: p.identity,
        sharedLeader: a && b ? sharesLeader(a, b) : false,
      }
    })
  })
  const anySharedLeader = $derived(pairRows.some((r) => r.sharedLeader))
</script>

<div class="space-y-4">
  <!-- Per-element comparison table. `relative` makes this the containing block for the
       absolutely-positioned sr-only spans inside the header InfoTips, so on phones
       (where the table is wider than the viewport and scrolls here) those 1px spans
       don't resolve against the page and add a phantom horizontal scrollbar. -->
  <div class="relative overflow-x-auto">
    <table class="w-full border-collapse text-small">
      <thead>
        <tr class="border-b border-hairline text-left text-caption uppercase tracking-wide text-muted">
          <th class="py-1.5 pr-3 font-medium">Element</th>
          <th class="py-1.5 pr-3 font-medium">
            <span class="inline-flex items-center gap-1">Specifier <InfoTip term="specifier" /></span>
          </th>
          <th class="py-1.5 pr-3 font-medium">tRNA</th>
          <th class="py-1.5 pr-3 font-medium">Complete</th>
          <th class="py-1.5 pr-3 font-medium">
            <span class="inline-flex items-center gap-1">ΔΔG <InfoTip term="ddg" /></span>
          </th>
          <th class="py-1.5 pr-3 font-medium">
            <span class="inline-flex items-center gap-1">Term&nbsp;ΔG <InfoTip term="terminator_energy" /></span>
          </th>
          <th class="py-1.5 font-medium">Links</th>
        </tr>
      </thead>
      <tbody>
        {#each els as m (m.member_id)}
          <tr class="border-b border-hairline/70 align-middle" data-ordinal={m.ordinal}>
            <td class="py-2 pr-3 font-mono text-caption text-muted">{ordinalLabel(m.ordinal, els.length)}</td>
            <td class="py-2 pr-3">
              <span class="inline-flex items-center gap-1.5">
                <span class="size-3 rounded-sm ring-1 ring-ink/10" style:background={aaColor(m.specifier.aa)} aria-hidden="true"></span>
                <span class="font-mono font-medium text-ink">{m.specifier.aa ?? '?'}</span>
                {#if m.specifier.codon}<span class="font-mono text-caption text-muted">{m.specifier.codon}</span>{/if}
              </span>
            </td>
            <td class="py-2 pr-3 font-mono text-caption text-muted">{m.trna ?? '–'}</td>
            <td class="py-2 pr-3">
              <span class="inline-flex items-center gap-1" title={m.completeness ?? 'unknown'}>
                {#if m.completeness === 'Full'}
                  <span class="size-2.5 rounded-full bg-body" aria-hidden="true"></span>
                  <span class="text-caption text-muted">Full</span>
                {:else if m.completeness === 'Partial'}
                  <span class="size-2.5 rounded-full border-[1.5px] border-muted" aria-hidden="true"></span>
                  <span class="text-caption text-muted">Partial</span>
                {:else}
                  <span class="text-caption text-muted">–</span>
                {/if}
              </span>
            </td>
            <!-- ΔΔG in-cell bar (chrome blue magnitude) -->
            <td class="py-2 pr-3">
              <div class="flex items-center gap-1.5">
                <div class="h-1.5 w-16 overflow-hidden rounded-full bg-surface-subtle ring-1 ring-hairline">
                  <div class="h-full rounded-full bg-brand" style:width="{(frac(m.deltadelta_g, DDG_FLOOR) * 100).toFixed(1)}%"></div>
                </div>
                <span class="font-mono text-caption text-ink tabular-nums">{num(m.deltadelta_g)}</span>
              </div>
            </td>
            <!-- Terminator energy in-cell bar (chrome slate magnitude) -->
            <td class="py-2 pr-3">
              <div class="flex items-center gap-1.5">
                <div class="h-1.5 w-16 overflow-hidden rounded-full bg-surface-subtle ring-1 ring-hairline">
                  <div class="h-full rounded-full bg-muted" style:width="{(frac(m.terminator_energy, TERME_FLOOR) * 100).toFixed(1)}%"></div>
                </div>
                <span class="font-mono text-caption text-ink tabular-nums">{num(m.terminator_energy)}</span>
              </div>
            </td>
            <td class="py-2">
              <span class="flex items-center gap-2.5 text-small">
                {#if m.tbdb_url}
                  <TbdbLink href={m.tbdb_url} title="tbdb.io entry for {m.unique_name}">tbdb.io</TbdbLink>
                {/if}
                <TbdbLink href={m.ncbi_url} title="NCBI Nucleotide (coordinate fallback)">NCBI</TbdbLink>
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Intra-locus pairwise %-identity (identity.json) -->
  {#if pairRows.length > 0}
    <div class="space-y-1.5">
      <h3 class="inline-flex items-center gap-1 text-caption uppercase tracking-wide text-muted">
        Pairwise identity <InfoTip term="mean_identity" />
      </h3>
      <ul class="space-y-1">
        {#each pairRows as r (r.a + '|' + r.b)}
          <li class="flex items-center gap-2 text-small">
            <span class="w-20 shrink-0 font-mono text-caption text-muted">{r.label}</span>
            <div class="h-1.5 w-32 overflow-hidden rounded-full bg-surface-subtle ring-1 ring-hairline">
              <div class="h-full rounded-full bg-brand-strong" style:width="{r.identity.toFixed(1)}%"></div>
            </div>
            <span class="font-mono text-caption text-ink tabular-nums">{r.identity.toFixed(1)}%</span>
            {#if r.sharedLeader && r.identity >= 100}
              <span class="text-caption text-muted" title="Both elements lie in one leader window (collapse-recovered locus), so the leader sequences are identical; this does not measure element-vs-element divergence.">
                ⓘ identical leader window
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if anySharedLeader}
    <p class="text-caption text-muted">
      Identity is over the full per-element leader (gap-aware global alignment); collapse-recovered loci
      share one leader window, so their leader identity saturates at 100%.
    </p>
  {/if}
</div>
