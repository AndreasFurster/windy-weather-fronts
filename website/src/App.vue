<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
    <nav class="topnav">
        <span class="brand">🌀 Weather Fronts</span>
        <RouterLink to="/">Chart comparison</RouterLink>
        <RouterLink to="/plugin">Windy plugin</RouterLink>
    </nav>
    <RouterView />
</template>

<style scoped>
.topnav {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    position: sticky;
    top: 0;
    z-index: 20;
}

.brand {
    font-weight: 700;
    margin-right: 8px;
}

.topnav a {
    color: var(--muted);
    font-size: 14px;
    text-decoration: none;
    padding: 4px 2px;
    border-bottom: 2px solid transparent;
}

.topnav a.router-link-active {
    color: var(--text);
    border-bottom-color: var(--accent);
}

.topnav a:hover {
    color: var(--text);
    text-decoration: none;
}
</style>
