const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Redis } = require('@upstash/redis');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

let state = { players: [], games: [], season: {}, customGames: [] };
(async () => {
  const saved = await redis.get('arcade-state');
  if (saved) state = saved;
})();

io.on('connection', (socket) => {
  socket.emit('init', state);

  socket.on('setPlayers', async (names) => {
    state.players = names.filter(n => n.trim());
    state.players.forEach(p => state.season[p] = state.season[p] || 0);
    await redis.set('arcade-state', state);
    io.emit('init', state);
  });

  socket.on('addCustomGame', async (gameName) => {
    if (!state.customGames.includes(gameName)) {
      state.customGames.push(gameName);
      await redis.set('arcade-state', state);
      io.emit('init', state);
    }
  });

  socket.on('addGame', async (game) => {
    const isLowerBetter = game.name.includes('Mini-Golf');
    const sorted = Object.entries(game.scores)
      .sort(([,a],[,b]) => isLowerBetter ? a-b : b-a);

    const places = {};
    sorted.forEach(([player, score], i) => {
      const points = i === 0 ? 5 : i === 1 ? 4 : i === 2 ? 3 : 2;
      places[player] = { score, place: i+1, points };
      state.season[player] = (state.season[player] || 0) + points;
    });

    state.games.unshift({
      id: Date.now(),
      name: game.name,
      places,
      date: new Date().toISOString()
    });
    if (state.games.length > 100) state.games.pop();

    await redis.set('arcade-state', state);
    io.emit('update', state);
  });

  socket.on('resetSeason', async () => {
    state.players.forEach(p => state.season[p] = 0);
    state.games = [];
    await redis.set('arcade-state', state);
    io.emit('update', state);
  });
});

server.listen(process.env.PORT || 3000);
