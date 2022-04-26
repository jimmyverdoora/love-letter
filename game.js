const { v4: uuidv4 } = require('uuid');
const generateDeck = require('./deck');

class GameManager {

    createNewGame(nPlayers) {
        const gameId = uuidv4();
        const deck = generateDeck();
        return {
            id: gameId,
            deck,
            state: 'open',
            players: [],
            nPlayers,
            discardedCard: null
        }
    }

    createPlayer(id, name) {
        return {
            id,
            name,
            hand: [],
            pile: [],
            points: 0
        }
    }

}