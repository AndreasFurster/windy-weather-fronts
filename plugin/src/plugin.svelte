<div class="plugin__mobile-header">
    { title }
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={ () => bcast.emit('rqstOpen', 'menu') }
    >
    { title }
    </div>

    {#if error}
        <div class="rounded-box bg-error size-s mt-10 mb-10">
            {error}
            <div class="mt-5 size-xs">
                Is the backend running? See the <code>server/</code> directory
                of the plugin repository.
            </div>
        </div>
    {/if}

    {#if sources.length}
        <div class="size-s mb-5 mt-10">Source</div>
        <select bind:value={selectedSourceId} on:change={() => loadSource(selectedSourceId)}>
            {#each sources as source}
                <option value={source.id} disabled={!source.available}>
                    {source.name}{source.available ? '' : ' (no data yet)'}
                </option>
            {/each}
        </select>

        {#if dataset}
            <div class="size-s mb-5 mt-15">Valid time (UTC)</div>
            <div class="timesteps">
                {#each dataset.timesteps as step, i}
                    <button
                        class="timestep"
                        class:selected={i === selectedStep}
                        on:click={() => selectStep(i)}
                    >
                        <span class="lead">
                            {step.forecastHours === 0 ? 'Analysis' : `+${step.forecastHours} h`}
                        </span>
                        <span>{formatTime(step.validTime)}</span>
                    </button>
                {/each}
            </div>

            <label class="size-s mt-10 checkbox-row">
                <input type="checkbox" bind:checked={followWindyTime} />
                Follow the Windy timeline
            </label>

            <button class="zoom-btn mt-10" on:click={zoomToCoverage}>
                Zoom to covered area
            </button>

            <div class="legend mt-15">
                <div><svg width="46" height="12"><line x1="0" y1="8" x2="46" y2="8" stroke="#1e64dc" stroke-width="3"/><polygon points="16,8 22,1 28,8" fill="#1e64dc"/></svg> Cold front</div>
                <div><svg width="46" height="12"><line x1="0" y1="8" x2="46" y2="8" stroke="#d63031" stroke-width="3"/><path d="M16 8 A 6 6 0 0 1 28 8 Z" fill="#d63031"/></svg> Warm front</div>
                <div><svg width="46" height="12"><line x1="0" y1="8" x2="46" y2="8" stroke="#9932cc" stroke-width="3"/><polygon points="6,8 12,1 18,8" fill="#9932cc"/><path d="M26 8 A 6 6 0 0 1 38 8 Z" fill="#9932cc"/></svg> Occluded front</div>
                <div><svg width="46" height="12"><line x1="0" y1="8" x2="46" y2="8" stroke="#1e64dc" stroke-width="3"/><line x1="12" y1="8" x2="24" y2="8" stroke="#d63031" stroke-width="3"/><polygon points="0,8 6,1 12,8" fill="#1e64dc"/><path d="M24 8 A 6 6 0 0 0 36 8 Z" fill="#d63031"/></svg> Stationary front</div>
                <div><svg width="46" height="12"><line x1="0" y1="8" x2="46" y2="8" stroke="#c47f17" stroke-width="3" stroke-dasharray="6 5"/></svg> Trough</div>
            </div>

            <div class="size-xs mt-15 muted">
                <div>Issued: {dataset.issuedTime ? formatTime(dataset.issuedTime) : 'unknown'}</div>
                <div>Collected by backend: {formatTime(dataset.fetchedAt)}</div>
                <div class="mt-5">{dataset.attribution}</div>
                {#if dataset.method === 'image-extraction'}
                    <div class="mt-5">
                        ⚠ Front geometry is vectorized from the published chart
                        images and is therefore approximate.
                    </div>
                {/if}
            </div>
        {/if}
    {:else if !error}
        <div class="size-s mt-10">Loading sources…</div>
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';
    import { map } from '@windy/map';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';
    import { fetchFronts, fetchSources } from './api';
    import { FrontsLayer } from './frontsLayer';
    import type { SourceDataset, SourceListing } from './frontTypes';

    const { title } = config;

    let sources: SourceListing[] = [];
    let selectedSourceId = 'knmi';
    let dataset: SourceDataset | null = null;
    let selectedStep = 0;
    let followWindyTime = false;
    let error: string | null = null;

    const layer = new FrontsLayer();

    $: if (followWindyTime) syncToWindyTime(store.get('timestamp'));

    const loadSource = async (sourceId: string): Promise<void> => {
        error = null;
        try {
            const previousHours = dataset?.timesteps[selectedStep]?.forecastHours ?? 0;
            dataset = await fetchFronts(sourceId);
            selectedStep = nearestStepByHours(previousHours);
            render();
        } catch (e) {
            dataset = null;
            layer.clear();
            error = e instanceof Error ? e.message : String(e);
        }
    };

    const selectStep = (i: number): void => {
        selectedStep = i;
        render();
    };

    const render = (): void => {
        const step = dataset?.timesteps[selectedStep];
        if (step) {
            layer.show(step.geojson.features);
        }
    };

    const nearestStepByHours = (hours: number): number => {
        if (!dataset?.timesteps.length) return 0;
        let best = 0, bestDiff = Infinity;
        dataset.timesteps.forEach((t, i) => {
            const diff = Math.abs(t.forecastHours - hours);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        });
        return best;
    };

    const syncToWindyTime = (timestamp: number): void => {
        if (!dataset?.timesteps.length) return;
        let best = -1, bestDiff = Infinity;
        dataset.timesteps.forEach((t, i) => {
            const diff = Math.abs(new Date(t.validTime).getTime() - timestamp);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        });
        // Only snap when a timestep is reasonably close to the map time.
        if (best >= 0 && bestDiff <= 12 * 3600_000 && best !== selectedStep) {
            selectedStep = best;
            render();
        }
    };

    const onTimestampChange = (timestamp: number): void => {
        if (followWindyTime) syncToWindyTime(timestamp);
    };

    const zoomToCoverage = (): void => {
        const source = sources.find(s => s.id === selectedSourceId);
        if (source) {
            const [w, s, e, n] = source.bounds;
            map.fitBounds([[s, w], [n, e]]);
        }
    };

    const formatTime = (iso: string): string => {
        const d = new Date(iso);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const pad = (n: number): string => String(n).padStart(2, '0');
        return `${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    };

    export const onopen = (_params: unknown): void => {
        // Opened via URL or menu; data loading happens in onMount.
    };

    onMount(async () => {
        store.on('timestamp', onTimestampChange);
        try {
            sources = await fetchSources();
            const preferred = sources.find(s => s.id === selectedSourceId && s.available)
                ?? sources.find(s => s.available);
            if (preferred) {
                selectedSourceId = preferred.id;
                await loadSource(preferred.id);
            } else {
                error = 'The backend has not collected any data yet. Try again in a minute.';
            }
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    });

    onDestroy(() => {
        store.off('timestamp', onTimestampChange);
        layer.clear();
    });
</script>

<style lang="less">
    select {
        width: 100%;
        &:focus {
            outline: none;
        }
    }

    .timesteps {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .timestep {
        display: flex;
        justify-content: space-between;
        padding: 5px 10px;
        border: 1px solid rgba(128, 128, 128, 0.35);
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 12px;

        .lead {
            font-weight: bold;
        }

        &.selected {
            background: rgba(128, 128, 128, 0.25);
            border-color: rgba(128, 128, 128, 0.7);
        }
    }

    .checkbox-row {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
    }

    .zoom-btn {
        padding: 5px 10px;
        border: 1px solid rgba(128, 128, 128, 0.35);
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 12px;
    }

    .legend {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 12px;

        svg {
            vertical-align: middle;
            margin-right: 6px;
        }
    }

    .muted {
        opacity: 0.75;
        line-height: 1.5;
    }
</style>
