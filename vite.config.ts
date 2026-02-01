import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    minify: 'esbuild', // Usa o esbuild para minificar o código
    terserOptions: {
      compress: {
        drop_console: true // Remove todos os consoles.log do código durante a minificação
      }
    },
    // Hook usado para processar o HTML após a construção
    rollupOptions: {
      output: {
        manualChunks: undefined,
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        plugins: [{
          name: 'html-transform',
          renderChunk(html) {
            // Aqui você pode modificar o HTML gerado, como minificá-lo ou injetar dados HTML
            // Neste exemplo, estamos apenas injetando um título no HTML
            return html.replace('<title>My App</title>', '<title>My App - Custom Title</title>')
          }
        }],
      },
    },
  },
})
