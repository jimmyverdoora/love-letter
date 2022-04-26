const axios = require('axios');
const GameManager = require('./game');
const HELP_TEXT = require('./help');

const GAME_LIMIT = 16;
const TELEGRAM_URL = 'https://api.telegram.org/bot' + process.env.BOT_SECRET;

class Telegram {

    constructor() {
        this.games = {}; // gameId: gameObj
        this.players = {}; // userId: gameId
        this.waitingForEnter = new Set();
        this.manager = new GameManager();
    }

    // -------------------------------------------------------------------------
    // Telegram interface ------------------------------------------------------
    // -------------------------------------------------------------------------

    async tg(path, payload) {
        return await axios.post(TELEGRAM_URL + path, payload);
    }

    async sendMessage(to, text, keyboard) {
        try {
            let payload = {
                chat_id: to,
                text,
                parse_mode: 'MarkdownV2',
            }
            if (keyboard) {
                payload['reply_markup'] = keyboard;
            }
            return await this.tg('/sendMessage', payload)
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    // -------------------------------------------------------------------------
    // Other methods -----------------------------------------------------------
    // -------------------------------------------------------------------------

    async elaborate(body) {
        if (body.callback_query) {
            return await this.elaborateQuery(body.callback_query);
        } else if (!body.message) {
            return;
        } else if (body.message.text.charAt(0) === '/') {
            return await this.elaborateCommand(body.message);
        } else {
            return await this.sendMessageToGroup(body.message);
        }
    }

    async elaborateCommand(fullMessage) {
        const message = fullMessage.text.substring(1);
        if (message === 'new') {
            await this.createNewGame(fullMessage);
        } else if (message === 'join') {
            await this.askForARoom(fullMessage.from.id);
        } else if (message === 'exit') {
            await this.exit(fullMessage.from.id);
        } else if (message === 'help') {
            await this.sendMessage(fullMessage.from.id, HELP_TEXT);
        } else {
            await this.sendMessage(fullMessage.from.id,
                "Questo comando non esiste\\!")
        }
        return;
    }

    async elaborateQuery(query) {
        const command = query.data.split(':')[0];
        const value = query.data.split(':')[1];
        if (command === 'nPlayers') {
            return await this.initGame(parseInt(value), query.from);
        } else if (command === 'join') {
            return await this.tryJoinTheRoom(value, query.from);
        } else if (command === 'play') {
            return await this.handleCardPlayed(value, query.from);
        }
    }

    async createNewGame(message) {
        const user = message.from.id;
        if (this.players[user]) {
            return await this.negateThisBecauseAlreadyInGame(user);
        } else if (Object.keys(this.games).length > GAME_LIMIT) {
            return await this.sendMessage(user, "Siamo pieni\\! Purtroppo non " +
                "si possono creare più di " + GAME_LIMIT + " partite");
        }
        const id = this.manager.createGameId();
        this.players[user] = id;
        const buttons = [];
        ['2', '3', '4', '5'].forEach(n => buttons.push(
            this.buildButton(n, 'nPlayers:' + n)))
        await this.sendMessage(user, "Per quanti giocatori è questa partita?",
            this.buildKeyboard(buttons));
    }

    async initGame(players, user) {
        if (this.games[this.players[user.id]]) {
            return await this.negateThisBecauseAlreadyInGame(user.id);
        } else if (!this.players[user.id]) {
            return await this.sendMessage(user.id, "Prima di dichiarare quanti " +
                "giocatori partecipano, crea una partita con /new");
        }
        if (players < 2 || players > 5) {
            return await this.sendMessage(user.id, "Una partita può avere " +
                "dai 2 ai 5 giocatori");
        }
        this.games[this.players[user.id]] = this.manager.createNewGame(players,
            this.players[user.id]);
        this.games[this.players[user.id]].players.push(
            this.manager.createPlayer(user.id, user.username));
        return await this.sendMessage(user.id, "Invita gli altri giocatori con " +
            "l'identificativo della partita: " + this.players[user.id]
                .split('-').join('\\-'));
    }

    async negateThisBecauseAlreadyInGame(user) {
        return await this.sendMessage(user, "Non puoi creare una nuova " +
            "partita perché stai gia partecipando ad una partita\\. " +
            "Se vuoi uscire usa il comando /exit");
    }

    async askForARoom(user) {
        this.waitingForEnter.add(user);
        const buttons = [];
        for (const game of Object.values(this.games)) {
            if (game.state === 'open') {
                buttons.push([this.buildButton(game.id, 'join:' + game.id)]);
            }
        }
        if (buttons.length === 0) {
            return await this.sendMessage(user, "Non ci sono partite " +
                "aperte\\! Creane una tu con il comando /new");
        }
        return await this.sendMessage(user, "Scegli in che partita entrare",
            this.buildKeyboard(...buttons));
    }

    async tryJoinTheRoom(id, from) {
        const user = from.id;
        const game = this.games[id];
        if (game) {
            this.waitingForEnter.delete(user);
            this.players[user] = id;
            game.players.push(this.manager.createPlayer(
                user, from.username
            ));
            await this.sendMessageToGroup({
                gameId: id,
                text: "Attenzione\\! " + from.username + " si è " +
                    "aggiunto alla partita"
            });
            if (game.players.length === game.nPlayers) {
                await this.startGame(id);
            }
        } else {
            await this.sendMessage(user, "Mi dispiace, questa " +
                "partita non esiste\\. Puoi terminare l'operazione usando /exit");
        }
    }

    async exit(user) {
        this.waitingForEnter.delete(user);
        const gameId = this.players[user];
        if (gameId && this.games[gameId]) {
            let index = -1;
            let count = 0;
            for (const u of this.games[gameId].players) {
                if (u.id === user) {
                    index = count;
                    break;
                }
            }
            if (index > -1) {
                this.games[gameId].players.splice(index, 1);
            }
            if (this.games[gameId].players.length === 0) {
                delete this.games[gameId];
            }
        }
        delete this.players[user];
        await this.sendMessage(user, "Bye\\! Torna a giocare presto");
        const actives = [];
        if (!gameId || !this.games[gameId]) {
            return;
        }
        for (let i = 0; i < this.games[gameId].players.length; i++) {
            if (this.games[gameId].players[i].state !== 'out') {
                actives.push(i);
            }
        }
        if (actives.length === 0) {
            await this.sendMessageToGroup({ text: "Game over\\!", gameId });
            return this.endGame(gameId);
        } else if (actives.length === 1) {
            await this.sendMessageToGroup({ gameId, text: "Game over\\! Ha vinto " +
            this.games[gameId].players[actives[0]].name })
            return this.endGame(gameId);
        }
    }

    async startGame(gameId) {
        this.games[gameId] = this.manager.startGame(this.games[gameId]);
        await this.sendMessageToGroup(
            { gameId, text: "Che il gioco abbia inizio\\!" });
        const player = this.manager.getActivePlayer(this.games[gameId]);
        for (const p of this.games[gameId].players) {
            await this.sendMessage(p.id, "Hai pescato " + this.style(p.hand[0]));
        }
        await this.sendMessageToGroup({ gameId, text: "Tocca a " + player.name });
        return await this.askActivePlayerWhatToPlay(player);
    }

    async askActivePlayerWhatToPlay(player) {
        const buttons = [];
        player.hand.forEach(card => buttons.push(this.buildButton(
            card.name, 'play:' + card.id
        )));
        const keyboard = this.buildKeyboard(buttons);
        return await this.sendMessage(player.id, "Hai pescato " +
            this.style(player.hand[1]) + "\\. Cosa giochi?", keyboard);
    }

    async handleCardPlayed(cardId, user) {
        const game = this.games[this.players[user.id]];
        if (!this.manager.playerCanPlay(user, cardId, game)) {
            return await this.sendMessage(user.id, "Non puoi giocare " + 
                "questa carta in questo momento, non trollare");
        }
        if (cardId.charAt(0) === '1') {
            return await this.handleGuard(game.id);
        } else if (cardId.charAt(0) === '2') {
            return await this.handlePriest(game.id);
        } else if (cardId.charAt(0) === '3') {
            return await this.handleBaron(game.id);
        } else if (cardId.charAt(0) === '4') {
            return await this.handleAncel(game.id);
        } else if (cardId.charAt(0) === '5') {
            return await this.handlePrince(game.id);
        } else if (cardId.charAt(0) === '6') {
            return await this.handleKing(game.id);
        } else if (cardId.charAt(0) === '7') {
            return await this.handleContess(game.id);
        } else if (cardId.charAt(0) === '8') {
            return await this.handlePrincess(game.id);
        }
    }

    async handlePostPlayEvents(gameId) {
        let game = this.games[gameId];
        const actives = [];
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].state !== 'out') {
                actives.push(i);
            }
        }
        if (actives.length === 0) {
            await this.sendMessageToGroup({ gameId, text: "Game over\\!" });
            return this.endGame(gameId);
        } else if (actives.length === 1) {
            await this.sendMessageToGroup({ gameId, text: "Game over\\! Ha vinto " +
                game.players[actives[0]].name })
            return this.endGame(gameId);
        }
        if (game.deck.length === 0) {
            await this.showOff(game);
            return this.endGame(gameId);
        }
        game = this.manager.progress(game);
        this.games[gameId] = game;
        return await this.askActivePlayerWhatToPlay(
            game.players[game.activePlayer]);
    
    }

    async showOff(game) {
        let best = {player: null, card: 0};
        for (const player of game.players) {
            if (player.state !== 'out' && player.hand[0].number > best.card) {
                best = {player, card: player.hand[0].number}
            } else if (player.state !== 'out' && player.hand[0].number === best.card) {
                if (player.pile.reduce((a, b) => a+b) > best.player.pile.reduce((a, b) => a+b)) {
                    best = {player, card: player.hand[0].number}
                }
            }
        }
        return await this.sendMessageToGroup({ gameId: game.id, text: "Gameover\\! Ha vinto " +
            best.player.name + " con " + this.style(best.player.hand[0])});
    }

    async sendMessageToGroup(message) {
        let text = '';
        if (message.from) {
            text = "*" + message.from.username + ":*\n";
        }
        text = text + message.text;
        const game = this.getGame(message);
        if (!game) {
            return;
        }
        for (let player of game.players) {
            if (!message.from || player.id !== message.from.id) {
                await this.sendMessage(player.id, text);
            }
        }
    }

    endGame(gameId) {
        console.log(this.games[gameId]);
    }

    getGame(message) {
        if (message.gameId) {
            return this.games[message.gameId];
        }
        return this.games[this.players[message.from.id]];
    }

    buildButton(name, callbackData) {
        callbackData.split('-').join('\\-');
        return {
            text: name,
            callback_data: callbackData
        };
    }

    buildKeyboard(buttons) {
        return {
            inline_keyboard: [buttons]
        };
    }

    style(card) {
        if (card.number > 6) {
            return "la " + card.name;
        } else if (card.number === 6) {
            return "il Re";
        } else if (card.number === 1 || card.number === 4) {
            return "una " + card.name;
        } else {
            return "un " + card.name;
        }
    }
}

module.exports = Telegram;
