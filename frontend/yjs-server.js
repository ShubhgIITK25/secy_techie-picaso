#!/usr/bin/env node
const http = require('http');
const WebSocket = require('ws');
let setupWSConnection;
try {
  // try to import the setup function from the package utils
  setupWSConnection = require('y-websocket/bin/utils').setupWSConnection;
} catch (e) {
  // fallback: require the package root (some installs may export differently)
  // eslint-disable-next-line no-console
  console.error('Unable to load y-websocket setup utility:', e.message);
  process.exit(1);
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 1234;
const HOST = process.env.YJS_HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('y-websocket server\n');
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // Log incoming upgrade for debugging
  // eslint-disable-next-line no-console
  console.log('WS upgrade request:', request.url, request.socket.remoteAddress);
  wss.handleUpgrade(request, socket, head, (ws) => {
    try {
      setupWSConnection(ws, request, { gc: true });
      // eslint-disable-next-line no-console
      console.log('WS connection established:', request.url, request.socket.remoteAddress);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('setupWSConnection error:', err);
      ws.close();
    }
  });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`y-websocket server listening on ${HOST}:${PORT}`);
});
