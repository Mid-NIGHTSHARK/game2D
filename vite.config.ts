import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const inputs: Record<string, string> = {
    main: resolve(__dirname, 'index.html'),
    rillkeepers: resolve(__dirname, 'games/rillkeepers/index.html')
  };

  const powderPath = resolve(__dirname, 'games/powder-and-pickaxe/index.html');
  if (fs.existsSync(powderPath)) {
    inputs['powder-and-pickaxe'] = powderPath;
  }

  return {
    base: isProd ? '/game2D/' : '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: inputs
      }
    },
    plugins: [
      {
        name: 'dev-server-game-routing',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url) {
              if (req.url.startsWith('/game2D/')) {
                req.url = req.url.replace('/game2D/', '/');
              }
              if (
                req.url === '/rillkeepers' ||
                req.url === '/rillkeepers/' ||
                req.url.startsWith('/rillkeepers/?') ||
                req.url.startsWith('/rillkeepers/#')
              ) {
                req.url = req.url.replace('/rillkeepers', '/games/rillkeepers');
              }
              if (
                req.url === '/powder-and-pickaxe' ||
                req.url === '/powder-and-pickaxe/' ||
                req.url.startsWith('/powder-and-pickaxe/?') ||
                req.url.startsWith('/powder-and-pickaxe/#')
              ) {
                req.url = req.url.replace('/powder-and-pickaxe', '/games/powder-and-pickaxe');
              }
            }
            next();
          });
        }
      },
      {
        name: 'flatten-nested-game-dist',
        closeBundle() {
          const distDir = resolve(__dirname, 'dist');
          const gamesDist = resolve(distDir, 'games');

          // Promote any game built under dist/games/<game> to dist/<game>
          if (fs.existsSync(gamesDist)) {
            const gameDirs = fs.readdirSync(gamesDist);
            for (const gameName of gameDirs) {
              const srcDir = resolve(gamesDist, gameName);
              const targetDir = resolve(distDir, gameName);

              if (fs.statSync(srcDir).isDirectory()) {
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }
                fs.cpSync(srcDir, targetDir, { recursive: true });
                fs.rmSync(srcDir, { recursive: true, force: true });
              }
            }
            // Remove the empty dist/games directory so dist/ is strictly flat
            fs.rmSync(gamesDist, { recursive: true, force: true });
          }

          // Copy static assets from games/rillkeepers/public into dist/rillkeepers
          const rillPublic = resolve(__dirname, 'games/rillkeepers/public');
          const targetRill = resolve(distDir, 'rillkeepers');
          if (fs.existsSync(rillPublic)) {
            if (!fs.existsSync(targetRill)) {
              fs.mkdirSync(targetRill, { recursive: true });
            }
            fs.cpSync(rillPublic, targetRill, { recursive: true });
          }

          // If powder-and-pickaxe/dist exists (self-contained Game #1 build), copy into dist/powder-and-pickaxe
          const powderDist = resolve(__dirname, 'powder-and-pickaxe/dist');
          if (fs.existsSync(powderDist)) {
            const targetPowder = resolve(distDir, 'powder-and-pickaxe');
            if (!fs.existsSync(targetPowder)) {
              fs.mkdirSync(targetPowder, { recursive: true });
            }
            fs.cpSync(powderDist, targetPowder, { recursive: true });
          }

          // When games/powder-and-pickaxe/public exists, copy into dist/powder-and-pickaxe
          const powderPublic = resolve(__dirname, 'games/powder-and-pickaxe/public');
          const targetPowder = resolve(distDir, 'powder-and-pickaxe');
          if (fs.existsSync(powderPublic)) {
            if (!fs.existsSync(targetPowder)) {
              fs.mkdirSync(targetPowder, { recursive: true });
            }
            fs.cpSync(powderPublic, targetPowder, { recursive: true });
          }
        }
      }
    ],
    server: {
      port: 3000
    }
  };
});
