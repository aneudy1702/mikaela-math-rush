import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { gameAudio } from './audio/AudioManager'

const root = createRoot(document.getElementById('root')!)
const params = new URLSearchParams(window.location.search)
const proof = params.has('proof')
const designGallery = params.has('design')
const social = params.has('social')
// Local Wave 6 rehearsal only. `?v2` keeps the kid app. Do not treat `/` → V3 as released.
const kidV2 = params.has('v2')

function renderV3() {
  void import('./ui/v3/V3App').then(({ V3App }) => {
    root.render(
      <StrictMode>
        <V3App />
      </StrictMode>,
    )
  })
}

if (social) {
  void import('./social/SocialPreview').then(({ SocialPreview }) => {
    root.render(
      <StrictMode>
        <SocialPreview />
      </StrictMode>,
    )
  })
} else if (proof) {
  void import('./ui/answers/SharedPlayProof').then(({ SharedPlayProof }) => {
    root.render(
      <StrictMode>
        <SharedPlayProof />
      </StrictMode>,
    )
  })
} else if (designGallery) {
  void import('./ui/gallery/DesignGallery').then(({ DesignGallery }) => {
    root.render(
      <StrictMode>
        <DesignGallery />
      </StrictMode>,
    )
  })
} else if (kidV2) {
  // Decode every clip now so the first tap already sounds instantly.
  gameAudio.preload()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} else {
  renderV3()
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
