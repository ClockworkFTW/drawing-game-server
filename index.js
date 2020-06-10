const app = require("express")();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const fs = require("fs");

const PORT = process.env.PORT || 3005;

const games = require("./games");

const words = fs.readFileSync("./words.txt", "utf-8").split("\n");

const startTurn = (gameId) => {
  let game = games.getGame(gameId);
  let players = games.getPlayersInGame(gameId);

  // Filter out players who have already drawn
  let eligiblePlayers = players.filter((player) => !player.hasDrawn);

  // If there are no more eligible players, start a new round
  if (eligiblePlayers.length === 0) {
    // Reset player state
    players.forEach((player) => {
      games.updatePlayer(player.game, player.id, {
        ...player,
        drawing: false,
        hasDrawn: false,
        locked: false,
      });
    });

    // Update game round
    game = games.updateGame(game.id, "round", game.round + 1);

    // Refresh player data
    players = games.getPlayersInGame(game.id);
    eligiblePlayers = games.getPlayersInGame(game.id);
  }

  // Check to see if game is over
  if (game.round > 3) {
    clearInterval(game.t);
    const winner = players.sort((a, b) => b.score - a.score)[0];
    return io.to(game.id).emit("alert", `${winner.name} has won the game!`);
  }

  // Designate a random eligible player as drawer
  const drawer =
    eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];

  players.forEach((player) => {
    // Set new drawer
    if (player.id === drawer.id) {
      games.updatePlayer(player.game, player.id, {
        ...player,
        drawing: true,
        hasDrawn: true,
        locked: false,
      });

      const wordOptions = Array.apply(null, { length: 3 }).map(
        (x) => words[Math.floor(Math.random() * words.length)]
      );

      io.to(player.id).emit("words", wordOptions);
    }

    // Set new guesser
    else {
      games.updatePlayer(player.game, player.id, {
        ...player,
        drawing: false,
        locked: false,
      });

      io.to(player.id).emit("alert", `${drawer.name} is picking a word`);
    }
  });

  // Reset game timer and emit updated player state
  const { id, timer, t } = games.updateGame(game.id, "timer", 80);
  clearInterval(t);
  io.to(id).emit("timer", timer);
  io.to(id).emit("players", games.getPlayersInGame(id));
};

const startTimer = (gameId) => {
  let game = games.getGame(gameId);

  const timer = setInterval(() => {
    io.to(game.id).emit("timer", game.timer);
    game = games.updateGame(game.id, "timer", game.timer - 1);

    // When timer runs out, clear interval and start new turn
    if (game.timer < 0) {
      clearInterval(timer);
      startTurn(game.id);
    }
  }, 1000);

  // Add timer to game object so it can be cleared elsewhere
  games.updateGame(game.id, "t", timer);
};

io.on("connection", (socket) => {
  // Join
  socket.on("join", ({ name, game }, cb) => {
    // Add player to game
    const { player, error } = games.addPlayer({
      id: socket.id,
      name,
      gameId: game,
    });

    // If error exists, return error to client
    if (error) return cb({ error });

    socket.join(player.game);

    socket.broadcast.to(player.game).emit("chat", {
      player: "admin",
      text: `${player.name} has joined the game`,
    });

    let players = games.getPlayersInGame(player.game);
    const { playing } = games.getGame(player.game);

    // If there are three or more players in the game
    if (players.length >= 3 && !playing) {
      // Set game to playing and start new turn
      games.updateGame(player.game, playing, true);

      return startTurn(player.game);
    } else {
      io.to(player.game).emit(
        "alert",
        `waiting for ${3 - players.length} more players`
      );
    }

    io.to(player.game).emit("players", players);
  });

  // Pick Word
  socket.on("pick word", (word) => {
    const player = games.getPlayer(socket.id);

    games.updateGame(player.game, "word", word);

    socket.broadcast.to(player.game).emit("alert", word.replace(/./g, "_"));

    socket.emit("alert", word);

    startTimer(player.game);
  });

  // Draw
  socket.on("draw", (lines) => {
    const player = games.getPlayer(socket.id);

    if (player.drawing) {
      socket.broadcast.emit("draw", lines);
    }
  });

  socket.on("chat", (message, cb) => {
    // Get player and game
    const player = games.getPlayer(socket.id);
    const { id, word, timer } = games.getGame(player.game);

    // If the player guesses the word
    if (message === word && !player.drawing && !player.locked) {
      // Send notification to game chat
      io.to(id).emit("chat", {
        player: "admin",
        text: `${player.name} guessed the word!`,
      });

      // Define point multipliers
      const guessPoints = 10 * timer;
      const drawPoints = 5 * timer;

      // Update player score
      let players = games.updatePlayer(id, player.id, {
        ...player,
        locked: true,
        score: player.score + guessPoints,
      });

      // Update drawer score
      const drawer = players.find((player) => player.drawing);
      players = games.updatePlayer(id, drawer.id, {
        ...drawer,
        score: drawer.score + drawPoints,
      });

      // Emit updated player state to client
      io.to(player.game).emit("players", players);

      if (turnOver(players)) {
        startTurn(id);
      }
    }
    // Else emit the message to the chat
    else {
      io.to(player.game).emit("chat", { player: player.name, text: message });
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    const player = games.removePlayer(socket.id);

    if (player) {
      io.to(player.game).emit("chat", {
        player: "admin",
        text: `${player.name} has left the game`,
      });

      io.to(player.game).emit("players", {
        players: games.getPlayersInGame(player.game),
      });
    }
  });
});

const turnOver = (players) => {
  let pass = true;
  players.forEach((player) => {
    if (!player.drawing && !player.locked) {
      pass = false;
    }
  });
  return pass;
};

server.listen(PORT, () => console.log(`Server running on port: ${PORT}`));
