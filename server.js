const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

let state = {
  players: [],
  games: [],
  season: {}
};

io.on('connection', (socket) => {
  socket.emit('init', state);

  socket.on('setPlayers', (names) => {
    state.players = names.filter(n => n.trim());
    state.players.forEach(p => state.season[p] = state.season[p] || 0);
    io.emit('init', state);
  });

  socket.on('addGame', (game) => {
    const isLowerBetter = game.name.includes('Mini-Golf');
    const sorted = Object.entries(game.scores)
      .sort(([,a],[,b]) => isLowerBetter ? a-b : b-a);

    const places = {};
    sorted.forEach(([player, score], i) => {
      const points = i === 0 ? 5 : i === 1 ? 4 : i === 2 ? 3 : 2;
      places[player] = { score, place: i+1, points };
      state.season[player] += points;
    });

    state.games.unshift({
      id: Date.now(),
      name: game.name,
      places,
      date: new Date().toISOString()
    });
    if (state.games.length > 100) state.games.pop();

    io.emit('update', state);
  });

  socket.on('resetSeason', () => {
    Object.keys(state.season).forEach(p => state.season[p] = 0);
    state.games = [];
    io.emit('update', state);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Running on port ${PORT}`));