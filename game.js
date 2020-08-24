const { v4: uuidv4 } = require('uuid');
const generateDeck = require('./deck');

class GameManager {

    createNewGame(nPlayers) {
        const gameId = uuidv4();
        const deck = generateDeck();
        return {
            id: gameId,
            deck,
            state: 'open', // open, closed
            players: [],
            nPlayers,
            discardedCard: null
        }
    }

    createPlayer(id, name) {
        return {
            id,
            name,
            state, // in, out, protected
            hand: [],
            pile: [],
            points: 0
        }
    }
}

module.exports = GameManager;