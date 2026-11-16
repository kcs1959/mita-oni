import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    // Phaser を含むので、プレイ画面だけ遅延読み込みにして初回表示を軽くする
    { path: '/play', component: () => import('./views/PlayView.vue') },
    { path: '/ranking', component: () => import('./views/RankingView.vue') },
    { path: '/rooms', component: () => import('./views/RoomsView.vue') },
    { path: '/how-to', component: () => import('./views/GuideView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
