import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  base: '/game2D/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'powder-and-pickaxe': resolve(__dirname, 'games/powder-and-pickaxe/index.html')
      }
    }
  },
  plugins: [
    {
      name: 'multi-game-output-mapper',
      closeBundle() {
        const gamesDir = resolve(__dirname, 'dist/games');
        if (fs.existsSync(gamesDir)) {
          const gameFolders = fs.readdirSync(gamesDir);
          for (const folder of gameFolders) {
            const srcPath = resolve(gamesDir, folder);
            const destPath = resolve(__dirname, 'dist', folder);
            if (!fs.existsSync(destPath)) {
              fs.cpSync(srcPath, destPath, { recursive: true });
            }
          }
        }
      },
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url) {
            if (req.url.startsWith('/powder-and-pickaxe')) {
              req.url = req.url.replace('/powder-and-pickaxe', '/games/powder-and-pickaxe');
            } else if (req.url.startsWith('/game2D/powder-and-pickaxe')) {
              req.url = req.url.replace('/game2D/powder-and-pickaxe', '/games/powder-and-pickaxe');
            }
          }
          next();
        });
      }
    }
  ]
});
