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

    playerCanPlay(player, cardId, game) {
        if (game.players[game.activePlayer].id === player.id);
        for (const c of game.players[game.activePlayer].hand) {
            if (c.id === cardId) {
                return true;
            }
        }
        return false;
    }

    checkIfHasCard(playerId, cardNumber, game) {
        const player = game.players[this.getPlayerIndexFromId(playerId, game)];
        for (const c of player.hand) {
            if (c.number === cardNumber) {
                return true;
            }
        }
        return false;
    }

    getPlayerIndexFromId(id, game) {
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].id == id) {
                return i;
            }
        }
        throw Error("Cannot find player " + id);
    }

    getPlayerNameFromId(id, game) {
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].id == id) {
                return game.players[i].name;
            }
        }
        throw Error("Cannot find player " + id);
    }

    eliminatePlayer(id, game) {
        const playerIndex = this.getPlayerIndexFromId(id, game);
        game.players[playerIndex].state = 'out';
        for (const card of game.players[playerIndex].hand) {
            game.players[playerIndex].pile.push(card);
        }
        game.players[playerIndex].hand = [];
        return game;
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
            while (newActive < game.activePlayer) {
                if (game.players[newActive].state !== 'out') {
                    break
                } else {
                    newActive = newActive + 1;
                }
            }
            if (newActive === game.activePlayer) {
                throw new Error("Impossible to find next active player");
            }
        }
        game.activePlayer = newActive;
        game.players[game.activePlayer].hand.push(this.draw(game));
        return game;

    }

    play(game, cardNumber) {
        let index = -1;
        const player = this.getActivePlayer(game);
        for (let i = 0; i < 2; i++) {
            if (player.hand[i].number === cardNumber) {
                index = i;
            }
        }
        if (index < 0) {
            throw new Error(`Cannot find ${cardNumber} in this hand: ${player.hand}`);
        }
        const card = game.players[game.activePlayer].hand.splice(index, 1);
        game.players[game.activePlayer].pile.push(card[0]);
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

    getStatus(game) {
        let status = '*Carte rimanenti:* ' + game.deck.length + '\n';
        for (const p of game.players) {
            status += `${p.state === 'in' ? '🟢' : p.state === 'out' ? '🔴' : '🔵'} *${p.name}*\n`;
            for (const c of p.pile) {
                status += `\\- ${c.name}\n`;
            }
        }
        return status;
    }
}

module.exports = GameManager;
