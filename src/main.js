import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router/index.js'

// Create Pinia store
const pinia = createPinia()

// Create and mount Vue app
const app = createApp(App)

// Register plugins
app.use(pinia)
app.use(router)

// Mount app
app.mount('#app')

// Listen for auth:logout event from API client
window.addEventListener('auth:logout', () => {
  router.push('/login')
})

// Initial loader is removed by App.vue after auth check completes
// This ensures no flash of authenticated content before redirect
