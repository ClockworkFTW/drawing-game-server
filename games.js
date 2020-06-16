let games = [];
let players = [];

const getGame = (gameId) => games.find((game) => game.id === gameId);

const updateGame = (gameId, prop, val) => {
  games = games.map((game) => {
    if (game.id === gameId) {
      return { ...game, [prop]: val };
    } else {
      return game;
    }
  });
  return games.find((game) => game.id === gameId);
};

const addPlayer = ({ id, name, gameId }) => {
  // Find existing game if game id is provided, otherwise join a random existing game
  let game = gameId
    ? games.find((game) => game.id === gameId)
    : games[Math.floor(Math.random() * games.length)];

  // If game does not exist, create new game
  if (!game) {
    game = {
      id: gameId,
      playing: false,
      round: 1,
      timer: 80,
      word: "chicken",
      players: [],
    };
  }

  // Check for players with matching names in the same game
  const existingPlayer = players.find(
    (player) => player.name === name && player.game === game.id
  );

  if (existingPlayer) {
    return { error: "name is taken" };
  }

  // Add new player to array
  const player = {
    id,
    name,
    score: 0,
    drawing: false,
    hasDrawn: false,
    locked: false,
    game: game.id,
  };
  players.push(player);

  // Add player id to game
  game.players.push(id);

  // Update games array
  const index = games.findIndex((game) => game.id === gameId);
  if (index !== -1) {
    games.splice(index, 1, game);
  } else {
    games.push(game);
  }

  return { player };
};

const updatePlayer = (gameId, playerId, updatedPlayer) => {
  players = players.map((player) => {
    if (player.game === gameId && player.id === playerId) {
      return updatedPlayer;
    } else {
      return player;
    }
  });
  return getPlayersInGame(gameId);
};

const removePlayer = (playerId) => {
  // Get index of target player
  const index = players.findIndex((player) => player.id === playerId);

  if (index !== -1) {
    // Remove player from players array and save removed player to const
    const player = players.splice(index, 1)[0];
    const { id } = player;

    // Remove player from games array
    games = games.map((game) => {
      if (game.id === player.game) {
        const players = game.players.filter((player) => player !== id);
        return { ...game, players };
      } else {
        return game;
      }
    });
    // Remove games with no players
    games = games.filter((game) => game.players.length !== 0);

    return player;
  }
};

const getPlayer = (playerId) =>
  players.find((player) => player.id === playerId);

const getPlayersInGame = (gameId) =>
  players.filter((player) => player.game === gameId);

module.exports = {
  getGame,
  updateGame,
  addPlayer,
  updatePlayer,
  removePlayer,
  getPlayer,
  getPlayersInGame,
};
