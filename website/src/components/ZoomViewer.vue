<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
    src: string;
    title?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const scale = ref(1);
const tx = ref(0);
const ty = ref(0);

let dragging = false;
let startX = 0;
let startY = 0;
let startTx = 0;
let startTy = 0;
let dragDist = 0;

const imgStyle = computed(() => ({
    transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
    cursor: dragging ? 'grabbing' : 'grab',
    userSelect: 'none' as const,
}));

function reset(): void {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
}

watch(() => props.src, reset);

function onWheel(e: WheelEvent): void {
    const factor = e.deltaY > 0 ? 0.85 : 1 / 0.85;
    const newScale = Math.max(0.25, Math.min(10, scale.value * factor));
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    tx.value = cx - (cx - tx.value) * (newScale / scale.value);
    ty.value = cy - (cy - ty.value) * (newScale / scale.value);
    scale.value = newScale;
}

function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    dragging = true;
    dragDist = 0;
    startX = e.clientX;
    startY = e.clientY;
    startTx = tx.value;
    startTy = ty.value;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent): void {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    dragDist = Math.hypot(dx, dy);
    tx.value = startTx + dx;
    ty.value = startTy + dy;
}

function onMouseUp(): void {
    dragging = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
}

function onOverlayClick(): void {
    if (dragDist < 4) emit('close');
}

function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
    <div
        class="overlay"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
        @click="onOverlayClick"
    >
        <img
            class="viewer-img"
            :src="src"
            :alt="title ?? ''"
            :style="imgStyle"
            draggable="false"
            @dblclick.stop="reset"
        />
        <button class="close-btn" title="Close (Esc)" @click.stop="emit('close')">×</button>
        <div class="caption">
            <span v-if="title">{{ title }} &mdash; </span>scroll to zoom · drag to pan · double-click to reset
        </div>
    </div>
</template>

<style scoped>
.overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 12, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    overflow: hidden;
}

.viewer-img {
    max-width: 90vw;
    max-height: 85vh;
    border-radius: 4px;
    display: block;
    transform-origin: center center;
}

.close-btn {
    position: absolute;
    top: 16px;
    right: 20px;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 50%;
    color: #fff;
    font-size: 22px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    z-index: 1;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.12);
}

.caption {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.45);
    font-size: 12px;
    white-space: nowrap;
    text-align: center;
    pointer-events: none;
    z-index: 1;
}
</style>
