import express from 'express';
import http from 'http';
import WebSocket, { Server } from 'ws';

const app = express();

const server = http.createServer(app);
const ws = new Server({ server });

ws.on('connection', (socket: WebSocket) => {
  socket.on('message', (message: string) => {
    console.log('message');
  });

  socket.on('close', (message: string) => {
    console.log(`close`)
  })

  socket.send('Hi there');
});

server.listen(3003, () => {
  console.log('server started at 3003');
});
