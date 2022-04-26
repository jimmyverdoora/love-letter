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

    startGame(game) {
        game.state = 'closed';
        game.activePlayer = Math.floor(Math.random() * game.nPlayers);
        game.deck = this.shuffle(game.deck);
        const discardedCard = this.draw(game);
        game.discardedCard = discardedCard;
        game = this.givePlayersACard(game);
        game.players[game.activePlayer].hand.push(this.draw(game));
        return game;
    }

    givePlayersACard(game) {
        for (let i = 0; i < game.players.length; i++) {
            game.players[i].hand.push(this.draw(game));
        }
        return game;
    }

    playerCanPlay(player, card, game) {
        if (game.players[game.activePlayer].id === player.id);
            for (const c of game.players[game.activePlayer]) {
                if (c.id === card.id) {
                    return true;
                }
            }
        return false;
    }

    progress(game) {
        let newActive = game.activePlayer + 1;
        while (newActive < game.players.length) {
            if (game.players[newActive].state !== 'out') {
                break;
            } else {
                newActive = newActive + 1;
            }
        }
        if (newActive === game.players.length) {
            newActive = 0;
            while (newActive < activePlayer) {
                if (game.players[newActive].state !== 'out') {
                    break
                } else {
                    newActive = newActive + 1;
                }
            }
            if (newActive === activePlayer) {
                throw new Error("Impossible to find next active player");
            }
        }
        game.activePlayer = newActive;
        game.players[activePlayer].hand.push(this.draw(game));
        return game;

    }

    shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    draw(game) {
        return game.deck.pop();
    }

    getActivePlayer(game) {
        return game.players[game.activePlayer];
    }
}

module.exports = GameManager;
