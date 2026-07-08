<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { chartUrl, fetchChartSources, type ChartSourceIndex, type StoredChart } from './api';
import { formatTime } from './time';
import ChartCard from './components/ChartCard.vue';

const sources = ref<ChartSourceIndex[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const activeSources = ref<string[]>([]); // empty = all
const analysisOnly = ref(true);
const showUtc = ref(false);
const lightbox = ref<{ src: string; title: string } | null>(null);

let refreshTimer: ReturnType<typeof setInterval> | undefined;

async function load(): Promise<void> {
    try {
        sources.value = await fetchChartSources();
        error.value = null;
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    void load();
    refreshTimer = setInterval(() => void load(), 5 * 60_000);
    window.addEventListener('keydown', onKey);
});

onUnmounted(() => {
    clearInterval(refreshTimer);
    window.removeEventListener('keydown', onKey);
});

function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') lightbox.value = null;
}

function toggleSource(id: string): void {
    activeSources.value = activeSources.value.includes(id)
        ? activeSources.value.filter(s => s !== id)
        : [...activeSources.value, id];
}

function isAnalysis(chart: StoredChart): boolean {
    if (chart.forecastHours !== undefined) return chart.forecastHours === 0;
    return /analysis|analyse/i.test(chart.label);
}

const availableSources = computed(() => sources.value.filter(s => s.available));
const unavailableSources = computed(() => sources.value.filter(s => !s.available));

const cards = computed(() => {
    const result: { source: ChartSourceIndex; chart: StoredChart }[] = [];
    for (const source of availableSources.value) {
        if (activeSources.value.length && !activeSources.value.includes(source.id)) continue;
        for (const chart of source.charts) {
            if (analysisOnly.value && !isAnalysis(chart)) continue;
            result.push({ source, chart });
        }
    }
    return result;
});

function openLightbox(source: ChartSourceIndex, chart: StoredChart): void {
    lightbox.value = {
        src: chartUrl(chart),
        title: `${source.name} — ${chart.label}`,
    };
}
</script>

<template>
    <header>
        <h1>Weather fronts — chart comparison</h1>
        <p class="sub">
            Surface analysis and forecast charts from European weather services,
            mirrored by the backend and refreshed hourly.
        </p>
    </header>

    <main>
        <div v-if="error" class="notice error">
            {{ error }} — is the backend (<code>server/</code>) running?
        </div>
        <div v-else-if="loading" class="notice">Loading charts…</div>

        <template v-else>
            <div class="controls">
                <div class="chips">
                    <button
                        v-for="source in availableSources"
                        :key="source.id"
                        class="chip"
                        :class="{ active: !activeSources.length || activeSources.includes(source.id) }"
                        @click="toggleSource(source.id)"
                    >
                        {{ source.name }}
                    </button>
                </div>
                <div class="toggles">
                    <label class="toggle">
                        <input type="checkbox" v-model="analysisOnly" />
                        Analysis only
                    </label>
                    <label class="toggle" title="Times are shown in your local timezone by default">
                        <input type="checkbox" v-model="showUtc" />
                        Show times in UTC
                    </label>
                </div>
            </div>

            <div class="grid">
                <ChartCard
                    v-for="{ source, chart } in cards"
                    :key="`${source.id}/${chart.file}`"
                    :source="source"
                    :chart="chart"
                    :utc="showUtc"
                    @zoom="openLightbox(source, chart)"
                />
            </div>

            <div v-if="!cards.length" class="notice">
                No charts match the current filters.
            </div>

            <div v-if="unavailableSources.length" class="unavailable">
                <span v-for="source in unavailableSources" :key="source.id">
                    {{ source.name }}: {{ source.error ?? 'unavailable' }}
                </span>
            </div>

            <footer>
                <p>
                    Chart images are downloaded and served by the project backend
                    (no hotlinking). All rights remain with the respective
                    services:
                </p>
                <ul>
                    <li v-for="source in sources" :key="source.id">
                        <a :href="source.pageUrl" target="_blank" rel="noopener">{{ source.name }}</a>
                        — {{ source.attribution }}
                        <span v-if="source.fetchedAt" class="fetched">
                            (mirrored {{ formatTime(source.fetchedAt, showUtc) }})
                        </span>
                    </li>
                </ul>
            </footer>
        </template>
    </main>

    <div v-if="lightbox" class="lightbox" @click="lightbox = null">
        <figure>
            <img :src="lightbox.src" :alt="lightbox.title" />
            <figcaption>{{ lightbox.title }} — click anywhere to close</figcaption>
        </figure>
    </div>
</template>

<style scoped>
header {
    padding: 28px 24px 4px;
    max-width: 1500px;
    margin: 0 auto;
}

h1 {
    margin: 0;
    font-size: 26px;
}

.sub {
    color: var(--muted);
    margin: 6px 0 0;
}

main {
    padding: 16px 24px 40px;
    max-width: 1500px;
    margin: 0 auto;
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.chip {
    background: var(--panel);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 14px;
    cursor: pointer;
    font-size: 13px;
}

.chip.active {
    color: var(--text);
    border-color: var(--accent);
}

.toggles {
    display: flex;
    gap: 16px;
}

.toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;
}

.notice {
    padding: 24px;
    text-align: center;
    color: var(--muted);
}

.notice.error {
    color: #ff9a9a;
}

.unavailable {
    margin-top: 18px;
    color: var(--muted);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

footer {
    margin-top: 36px;
    border-top: 1px solid var(--border);
    padding-top: 16px;
    color: var(--muted);
    font-size: 13px;
}

footer ul {
    margin: 8px 0 0;
    padding-left: 18px;
}

.fetched {
    font-size: 12px;
}

.lightbox {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 12, 0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
    z-index: 10;
}

.lightbox figure {
    margin: 0;
    max-width: 96vw;
    max-height: 94vh;
    text-align: center;
}

.lightbox img {
    max-width: 96vw;
    max-height: 88vh;
    background: #fff;
    border-radius: 6px;
}

.lightbox figcaption {
    color: var(--muted);
    margin-top: 8px;
    font-size: 13px;
}
</style>
