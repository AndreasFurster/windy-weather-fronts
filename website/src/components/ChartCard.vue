<script setup lang="ts">
import { chartUrl, type ChartSourceIndex, type StoredChart } from '../api';

defineProps<{
    source: ChartSourceIndex;
    chart: StoredChart;
}>();

const emit = defineEmits<{
    zoom: [];
}>();

function formatUtc(iso: string): string {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())} ${months[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
</script>

<template>
    <article class="card">
        <button class="image-wrap" @click="emit('zoom')" :title="'Click to enlarge'">
            <img :src="chartUrl(chart)" :alt="`${source.name} — ${chart.label}`" loading="lazy" />
        </button>
        <div class="meta">
            <div class="row">
                <span class="source">{{ source.name }}</span>
                <span class="label">{{ chart.label }}</span>
            </div>
            <div class="row muted">
                <span v-if="chart.validTime">Valid {{ formatUtc(chart.validTime) }}</span>
                <span v-else>{{ source.region }}</span>
                <a :href="source.pageUrl" target="_blank" rel="noopener">source ↗</a>
            </div>
        </div>
    </article>
</template>

<style scoped>
.card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: border-color 0.15s;
}

.card:hover {
    border-color: var(--accent);
}

.image-wrap {
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    background: #fff;
    cursor: zoom-in;
    aspect-ratio: 3 / 2;
}

.image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}

.meta {
    padding: 8px 12px 10px;
}

.row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
}

.source {
    font-weight: 600;
}

.label {
    color: var(--accent);
    font-size: 13px;
    white-space: nowrap;
}

.muted {
    color: var(--muted);
    font-size: 12px;
}
</style>
