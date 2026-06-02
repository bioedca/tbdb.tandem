<script lang="ts">
  // DEV-ONLY design-system review surface (PLAN §8.5). Renders the tokens, the
  // three palettes, every base component, and the live chrome⟂data disjointness
  // proof. Not registered in production (see router.ts).
  import { brand, neutral } from '../lib/design/tokens'
  import {
    SPECIFIER_GROUPS,
    SPECIFIER_COLORS,
    UNKNOWN_SPECIFIER_COLOR,
    PHYLUM_COLORS,
    PHYLUM_DEFAULT_COLOR,
    swatchBackground,
    assertChromeDataDisjoint,
  } from '../lib/color'
  import Card from '../lib/components/Card.svelte'
  import Button from '../lib/components/Button.svelte'
  import Badge from '../lib/components/Badge.svelte'
  import FacetChip from '../lib/components/FacetChip.svelte'
  import Kpi from '../lib/components/Kpi.svelte'
  import Spinner from '../lib/components/Spinner.svelte'
  import TbdbLink from '../lib/components/TbdbLink.svelte'
  import NoPolarityBanner from '../lib/components/NoPolarityBanner.svelte'
  import ArchitectureDiagram from '../lib/components/ArchitectureDiagram.svelte'
  import ElementComparison from '../lib/components/ElementComparison.svelte'
  import { store } from '../lib/stores/filters.svelte'

  const proof = assertChromeDataDisjoint()

  // Architecture / comparison showcase (S2.1). Reads real loci from the store and
  // lazily pulls identity.json so the panel's %-identity populates. Covers a pair,
  // a triple, a mixed two-tone locus, and a collapse-recovered shared-leader locus.
  $effect(() => {
    void store.ensureIdentity()
  })
  // pair · triple · mixed shared-leader · mixed ILE;LEU · nested overlap (+ normal
  // spacer) · mixed partial overlap · loop-only member (s1 absent, s1_loop present).
  const ARCH_SHOWCASE = ['T0001', 'T0062', 'T0342', 'T0003', 'T0079', 'T0210', 'T0395']
  const archCases = $derived(
    ARCH_SHOWCASE.map((id) => ({
      id,
      locus: store.loci.find((l) => l.tandem_id === id) ?? null,
      members: store.membersByLocus.get(id) ?? [],
      pairs: store.identityByLocus?.get(id) ?? [],
    })).filter((c) => c.locus && c.members.length > 0),
  )

  const typeRamp = [
    { cls: 'text-display', label: 'display' },
    { cls: 'text-h1', label: 'h1' },
    { cls: 'text-h2', label: 'h2' },
    { cls: '', label: 'body' }, // base default size (no text-body size utility)
    { cls: 'text-small', label: 'small' },
    { cls: 'text-caption', label: 'caption' },
  ]

  const chrome = [
    { name: 'brand', hex: brand.accent },
    { name: 'brand-strong', hex: brand.accentStrong },
    { name: 'brand-subtle', hex: brand.accentSubtle },
    { name: 'ink', hex: neutral.ink },
    { name: 'body', hex: neutral.text },
    { name: 'muted', hex: neutral.muted },
    { name: 'hairline', hex: neutral.hairline },
    { name: 'surface', hex: neutral.surface },
    { name: 'surface-subtle', hex: neutral.surfaceSubtle },
  ]

  const phyla = [...Object.entries(PHYLUM_COLORS), ['(unassigned)', PHYLUM_DEFAULT_COLOR]] as [
    string,
    string,
  ][]

  let removed = $state(false)
</script>

<div class="space-y-8">
  <div>
    <h1 class="text-display text-ink">Design system</h1>
    <p class="mt-1 text-body text-muted">
      TandemView identity (PLAN §8) — dev-only review surface at <code
        class="font-mono text-small">/styleguide</code
      >.
    </p>
  </div>

  <Card title="Chrome ⟂ data disjointness" subtitle="§8.2 invariant — proven at runtime">
    <div class="flex flex-wrap gap-8 text-small">
      <div>
        <div class="font-mono text-display text-ink">{proof.minHueGap.toFixed(1)}°</div>
        <div class="text-muted">brand-accent hue gap to nearest specifier (≥ 20° required)</div>
      </div>
      <div>
        <div class="font-mono text-display text-ink">
          {proof.maxNeutralSaturation.toFixed(2)} &lt; {proof.minDataSaturation.toFixed(2)}
        </div>
        <div class="text-muted">max neutral vs min specifier saturation (neutrals strictly lower)</div>
      </div>
      <div>
        <div class="font-mono text-display text-ink">{proof.minRgbDistance.toFixed(0)}</div>
        <div class="text-muted">min sRGB distance, chrome → specifier (informational)</div>
      </div>
    </div>
  </Card>

  <Card title="Typography" subtitle="Inter (UI) · JetBrains Mono (data) — self-hosted">
    <div class="space-y-2">
      {#each typeRamp as t (t.cls)}
        <div class="flex items-baseline gap-4">
          <span class="w-20 shrink-0 font-mono text-caption text-muted">{t.label}</span>
          <span class={t.cls}>The quick brown fox — TandemView</span>
        </div>
      {/each}
      <div class="flex items-baseline gap-4">
        <span class="w-20 shrink-0 font-mono text-caption text-muted">mono</span>
        <span class="font-mono text-body">CP045927:1984088–1984287 · GYROCCC · ΔΔG −15.0</span>
      </div>
    </div>
  </Card>

  <Card title="Chrome / brand palette" subtitle="ink·slate neutrals + one teal accent (§8.2)">
    <div class="flex flex-wrap gap-3">
      {#each chrome as c (c.name)}
        <div class="w-28">
          <div
            class="h-12 rounded-md border border-hairline"
            style:background={c.hex}
          ></div>
          <div class="mt-1 text-caption font-medium text-ink">{c.name}</div>
          <div class="font-mono text-caption text-muted">{c.hex}</div>
        </div>
      {/each}
    </div>
  </Card>

  <Card title="Specifier (data) palette" subtitle="20 AAs grouped by biochemistry · ? grey · mixed = 45° two-tone (§8.2)">
    <div class="space-y-4">
      {#each SPECIFIER_GROUPS as group (group.name)}
        <div>
          <div class="mb-1.5 text-caption font-medium uppercase tracking-wide text-muted">
            {group.name}
          </div>
          <div class="flex flex-wrap gap-2">
            {#each group.members as aa (aa)}
              <div class="w-16">
                <div
                  class="h-10 rounded-md ring-1 ring-black/10"
                  style:background={SPECIFIER_COLORS[aa]}
                ></div>
                <div class="mt-1 font-mono text-caption text-ink">{aa}</div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
      <div class="flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
        <div class="w-16">
          <div class="h-10 rounded-md ring-1 ring-black/10" style:background={UNKNOWN_SPECIFIER_COLOR}></div>
          <div class="mt-1 font-mono text-caption text-ink">?</div>
        </div>
        <div class="w-16">
          <div class="h-10 rounded-md ring-1 ring-black/10" style:background={swatchBackground('ILE;LEU')}></div>
          <div class="mt-1 font-mono text-caption text-ink">ILE;LEU</div>
        </div>
        <div class="w-16">
          <div class="h-10 rounded-md ring-1 ring-black/10" style:background={swatchBackground('GLY;TRP')}></div>
          <div class="mt-1 font-mono text-caption text-ink">GLY;TRP</div>
        </div>
      </div>
    </div>
  </Card>

  <Card title="Phylum context ramp" subtitle="separate, neutral — never competes with specifier (§8.2)">
    <div class="flex flex-wrap gap-3">
      {#each phyla as [name, hex] (name)}
        <div class="w-32">
          <div class="h-10 rounded-md border border-hairline" style:background={hex}></div>
          <div class="mt-1 text-caption text-ink">{name}</div>
        </div>
      {/each}
    </div>
  </Card>

  <Card title="Components" subtitle="§8.5 base set">
    <div class="space-y-6">
      <div class="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Disabled</Button>
        <Spinner />
        <TbdbLink href="https://tbdb.io/tboxes/GYROCCC.html">tbdb.io / GYROCCC</TbdbLink>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="high" />
        <Badge variant="low" />
        <Badge variant="unknown" />
        <Badge variant="inferred" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <FacetChip label="specifier" value="TRP" swatch={swatchBackground('TRP')} onremove={() => {}} />
        <FacetChip label="specifier" value="ILE;LEU" swatch={swatchBackground('ILE;LEU')} onremove={() => {}} />
        <FacetChip label="phylum" value="Firmicutes" onremove={() => {}} />
        {#if !removed}
          <FacetChip label="confidence" value="high" onremove={() => (removed = true)} />
        {:else}
          <span class="text-small text-muted">chip removed ✓</span>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Loci" value={470} />
        <Kpi label="Members" value={949} hint="canonical cores" />
        <Kpi label="Intra-locus pairs" value={488} />
        <Kpi label="Main-tree tips" value={847} hint="Stem-I length-gated" />
      </div>

      <NoPolarityBanner />
    </div>
  </Card>

  <Card
    title="Tandem architecture + element comparison"
    subtitle="§9① signature view (S2.1) — to-scale, biological 5′→3′; element tinted by its own specifier"
  >
    <div class="space-y-8">
      {#each archCases as c (c.id)}
        {@const l = c.locus!}
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2 text-small">
            <span class="font-mono font-medium text-ink">{c.id}</span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-3 rounded-sm ring-1 ring-ink/10" style:background={swatchBackground(l.specifier_aa)} aria-hidden="true"></span>
              <span class="font-mono text-ink">{l.specifier_aa ?? '?'}</span>
            </span>
            <span class="text-muted">· {l.same_specifier ? 'same' : 'mixed'} · {l.strand} strand · {l.n_cores} cores · {l.type}</span>
          </div>
          <ArchitectureDiagram
            members={c.members}
            strand={l.strand}
            funcClass={l.func_class}
            funcSource={l.func_source}
            downstreamGene={l.downstream_gene}
          />
          <ElementComparison members={c.members} pairs={c.pairs} />
        </div>
      {/each}
      {#if archCases.length === 0}
        <Spinner label="Loading loci…" />
      {/if}
    </div>
  </Card>
</div>
