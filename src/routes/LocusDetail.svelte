<script lang="ts">
  // svelte-spa-router passes matched route params (PLAN §7.2: /locus/:id).
  let { params }: { params?: { id?: string } } = $props()
</script>

<section>
  <h1 class="text-2xl font-semibold tracking-tight">Locus {params?.id ?? ''}</h1>
  <p class="mt-2 text-slate-600">
    Per-locus detail: tandem architecture, element comparison, in-app RNA structure, and deep
    links to tbdb.io / NCBI. <span class="italic">Placeholder — built in S1.5 / S2.x.</span>
  </p>
</section>
