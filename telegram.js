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
                from: '',
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
        if (gameId) {
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
        return await this.sendMessage(user, "Bye\\! Torna a giocare presto");
    }

    async sendMessageToGroup(message) {
        const text = '*' + message.from.username + ":*\n" + message.text;
        const game = this.getGame(message);
        if (!game) {
            return;
        }
        for (let player of game.players) {
            if (player.id !== message.from.id) {
                await this.sendMessage(player.id, text);
            }
        }
    }

    getGame(message) {
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
}

module.exports = Telegram;