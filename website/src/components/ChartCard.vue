<script setup lang="ts">
import { chartUrl, type ChartSourceIndex, type StoredChart } from '../api';
import { formatTime } from '../time';

defineProps<{
    source: ChartSourceIndex;
    chart: StoredChart;
    utc: boolean;
}>();

const emit = defineEmits<{
    zoom: [];
}>();
</script>

<template>
    <article class="card">
        <video
            v-if="chart.mediaType === 'video'"
            class="media"
            :src="chartUrl(chart)"
            controls
            loop
            muted
            playsinline
        />
        <button v-else class="media zoomable" @click="emit('zoom')" title="Click to enlarge">
            <img :src="chartUrl(chart)" :alt="`${source.name} — ${chart.label}`" loading="lazy" />
        </button>
        <div class="meta">
            <div class="row">
                <span class="source">{{ source.name }}</span>
                <span class="label">{{ chart.label }}</span>
            </div>
            <div class="row muted">
                <span v-if="chart.validTime">Valid {{ formatTime(chart.validTime, utc) }}</span>
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

.media {
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    background: #fff;
    aspect-ratio: 3 / 2;
    width: 100%;
}

.zoomable {
    cursor: zoom-in;
}

.media img,
video.media {
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
    overflow: hidden;
    text-overflow: ellipsis;
}

.muted {
    color: var(--muted);
    font-size: 12px;
}
</style>
