import markdown from '@dansvel/vite-plugin-markdown'
import { default as minifyHTML } from 'rollup-plugin-minify-html-literals'

export default {
  plugins: [markdown({})],
  server: {
    fs: {
      allow: ['..']
    }
  },
  build: {
    rollupOptions: {
      plugins: [minifyHTML.default()]
    }
  }
}
