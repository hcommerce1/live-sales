import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// Hide initial loader when Vue app is ready
const app = createApp(App)

app.mount('#app')

// Remove the initial HTML loader with fade animation
const initialLoader = document.getElementById('initial-loader')
if (initialLoader) {
    initialLoader.classList.add('fade-out')
    setTimeout(() => {
        initialLoader.remove()
    }, 300)
}
