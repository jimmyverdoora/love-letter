const { v4: uuidv4 } = require('uuid');
const generateDeck = require('./deck');

class GameManager {

    createGameId() {
        return uuidv4();
    }

    createNewGame(nPlayers, gameId) {
        const deck = generateDeck();
        return {
            id: gameId,
            deck,
            state: 'open', // open, closed
            players: [],
            nPlayers,
            activePlayer: null,
            discardedCard: null
        }
    }

    createPlayer(id, name) {
        return {
            id,
            name,
            state: 'in', // in, out, protected
            hand: [],
            pile: [],
            points: 0
        }
    }
}

module.exports = GameManager;