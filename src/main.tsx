import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { gameAudio } from './audio/AudioManager'

const root = createRoot(document.getElementById('root')!)
const designGallery = new URLSearchParams(window.location.search).has('design')

if (designGallery) {
  void import('./ui/gallery/DesignGallery').then(({ DesignGallery }) => {
    root.render(
      <StrictMode>
        <DesignGallery />
      </StrictMode>,
    )
  })
} else {
  // Decode every clip now so the first tap already sounds instantly.
  gameAudio.preload()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ignore offline registration failures */
      })
    })
  } else {
    // The worker serves cache-first, which would pin stale modules in dev.
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => undefined)
  }
}
