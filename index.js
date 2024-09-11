import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(join(__dirname, 'public')));


io.on('connection', (socket) => {
    console.log('a user connected 🐙');
    socket.on('disconnect', () => {
        console.log('user disconnected 🐙');
    });
});

server.listen(3000, () => {
    console.log('server running at http://localhost:3000 🐙');
});
