import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { bootstrapEngine, setSocketServer, handleSocketConnection, config } from './app.js';
import { apiRouter } from './routes/api.js';
import { initStorage, getStorageBackend } from './storage/store.js';

const corsOptions =
  config.corsOrigin === false
    ? { origin: false as const }
    : { origin: config.corsOrigin === '*' ? true : config.corsOrigin };

await initStorage();
await bootstrapEngine();

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRouter);

if (config.isProduction && existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(join(config.clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
});

setSocketServer(io);
io.on('connection', (socket) => {
  handleSocketConnection(socket);
});

httpServer.listen(config.port, () => {
  console.log(`BidKing server [${config.nodeEnv}] http://localhost:${config.port}`);
  console.log(`Storage backend: ${getStorageBackend()}`);
  if (config.isProduction) {
    console.log(`Static assets: ${config.clientDist}`);
  }
});
