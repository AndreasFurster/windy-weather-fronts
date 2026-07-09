import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import ChartsView from './views/ChartsView.vue';
import PluginView from './views/PluginView.vue';
import './style.css';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', component: ChartsView },
        { path: '/plugin', component: PluginView },
    ],
});

createApp(App).use(router).mount('#app');
