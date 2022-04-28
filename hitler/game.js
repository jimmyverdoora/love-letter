const { v4: uuidv4 } = require('uuid');
const RED = '🔴';
const BLACK = '⚫';

class GameManager {

    createGameId() {
        return uuidv4();
    }

    createNewGame(nPlayers, gameId) {
        const deck = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const roleDeck = ['H', 'B', 'R', 'R', 'R'];
        return {
            id: gameId,
            deck,
            roleDeck,
            state: 'open', // open, closed
            players: [],
            nPlayers,
            reds: 0,
            blacks: 0,
        }
    }

    createPlayer(id, name) {
        return {
            id,
            name,
            role,
            hand: [],
            currentVote: null,
            points: 0
        }
    }

    startGame(game) {
        game.state = 'closed';
        game.activePlayer = Math.floor(Math.random() * game.nPlayers);
        game.deck = this.shuffle(game.deck);
        game.roleDeck = this.shuffle(game.roleDeck);
        game = this.givePlayersARole(game);
        return game;
    }

    givePlayersARole(game) {
        for (let i = 0; i < game.players.length; i++) {
            game.players[i].role = game.roleDeck.pop();
        }
        return game;
    }

    getPlayerIndexFromId(id, game) {
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].id == id) {
                return i;
            }
        }
        throw Error("Cannot find player " + id);
    }

    setCancelor(id, game) {
        const index = this.getPlayerIndexFromId(id, game);
        game.cancelor = index;
        return game;
    }

    getHitler(game) {
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].role === 'H') {
                return game.players[i];
            }
        }
    }

    everyOneVoted(game) {
        for (const p of game.players) {
            if (!p.currentVote) {
                return false;
            }
        }
        return true;
    }

    getVotes(game) {
        let y = 0;
        let n = 0;
        for (const p of game.players) {
            if (p.currentVote === 'Y') {
                y++;
            }
            if (p.currentVote === 'N') {
                n++;
            }
        }
        return { y, n };
    }

    cleanVotes(game) {
        for (let i = 0; i < game.players.length; i++) {
            game.players[i].currentVote = null;
        }
        return game;
    }

    getPlayerNameFromId(id, game) {
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].id == id) {
                return game.players[i].name;
            }
        }
        throw Error("Cannot find player " + id);
    }

    progress(game) {
        let newActive = game.activePlayer + 1;
        if (newActive === game.players.length) {
            newActive = 0;
        }
        game.cancelor = null;
        game.activePlayer = newActive;
        return game;
    }

    play(game, value) {
        let played = false;
        for (let i = 0; i < 2; i++) {
            const card = game.players[game.cancelor].hand.pop();
            if (!played && card == value) {
                if (value) {
                    game.reds += 1;
                } else {
                    game.blacks += 1;
                }
                played = true;
            } else {
                game.deck.push(card);
            }
        }
        if (!played) {
            throw Error(`Cannot play ${value}`)
        }
        game.deck = this.shuffle(game.deck);
        return game;
    }

    shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    draw3forPresident(game) {
        game.players[game.activePlayer].hand.push(game.deck.pop());
        game.players[game.activePlayer].hand.push(game.deck.pop());
        game.players[game.activePlayer].hand.push(game.deck.pop());
        return game;
    }

    pass2toCancelor(game, discardedValue) {
        let discarded = false;
        for (let i = 0; i < 3; i++) {
            const card = game.players[game.activePlayer].hand.pop();
            if (!discarded && card == discardedValue) {
                game.deck.push(card);
                discarded = true;
            } else {
                game.players[game.cancelor].hand.push(card);
            }
        }
        if (!discarded) {
            throw Error(`Cannot discard ${discardedValue} from ${game.players[game.cancelor].hand}`)
        }
        return game;
    }

    getActivePlayer(game) {
        return game.players[game.activePlayer];
    }

    getStatus(game) {
        let status = `*Presidente:* ${game.players[game.activePlayer].name}\n`;
        status += `*Cancelliere:* ${game.cancelor ? game.players[game.cancelor].name : ' \\- '}\n`;
        status += `${RED} `.repeat(game.reds) + '\n';
        status += `${BLACK} `.repeat(game.blacks);
        return status;
    }
}

module.exports = GameManager;
