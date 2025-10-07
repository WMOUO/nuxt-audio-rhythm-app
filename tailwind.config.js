/**
 * Tailwind CSS configuration for the Nuxt rhythm app.
 *
 * The `content` array tells Tailwind where to search for class
 * names to generate CSS. This includes Vue components, layouts,
 * pages, plugins and the main config file. You can adjust the
 * paths if you add more directories with utility classes.
 */
module.exports = {
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
