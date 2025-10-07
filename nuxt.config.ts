import { defineNuxtConfig } from 'nuxt/config'

// Nuxt configuration for the rhythm timing web app.
//
// This configuration sets up Tailwind CSS for styling and the
// Nuxt UI component library for UI elements. It also configures
// PostCSS to process Tailwind and autoprefix CSS. The build
// section transpiles the wavesurfer.js library to ensure it
// works properly in the Nuxt environment.
export default defineNuxtConfig({
  css: ['~/assets/css/tailwind.css'],
  modules: ['@nuxt/ui'],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  build: {
    transpile: ['wavesurfer.js'],
  },
})
