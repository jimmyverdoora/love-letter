const axios = require('axios');
const GameManager = require('./game');

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
                payload[reply_markup] = keyboard;
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
        return await this.troll(body.message);
        if (body.message.text.charAt(0) === '/') {
            return await this.elaborateCommand(body.message);
        } else if (this.waitingForEnter.has(body.message.from.id)) {
            return await this.tryJoinTheRoom(body.message);
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
            // show help
        } else {
            // wrong command
        }
        return; // TODO
    }

    async createNewGame(message) {
        const user = message.from.id;
        if (this.players[user]) {
            return await this.negateThisBecauseAlreadyInGame(user);
        }
        const id = this.manager.createGameId();
        this.players[user] = id;
        await this.sendMessage(user, "Per quanti giocatori è questa partita?" +
            "\n/2\n/3\n/4\n/5");
    }

    async initGame(message) {
        const user = message.from.id;
        if (this.games[this.players[user]]) {
            return await this.negateThisBecauseAlreadyInGame(user);
        } else if (!this.players[user]) {
            return await this.sendMessage(user, "Prima di dichiarare quanti " +
                "giocatori partecipano, crea una partita con /new");
        }
        this.games[this.players[user]] = this.manager.createNewGame(
            parseInt(message.text.substring(1)));
        return await this.sendMessage(user, "Invita gli altri giocatori con " +
            "l'identificativo della partita: " + this.players[user]);
    }

    async negateThisBecauseAlreadyInGame(user) {
        return await this.sendMessage(user, "Non puoi creare una nuova " +
            "partita perché stai gia partecipando ad una partita\\. " +
            "Se vuoi uscire usa il comando /exit");
    }

    async askForARoom(user) {
        this.waitingForEnter.add(user);
        return await this.sendMessage(user, "Incollami l'identificativo della" +
            " partita")
    }

    async tryJoinTheRoom(message) {
        const user = message.from.id;
        const game = this.games[message.text];
        if (game) {
            this.waitingForEnter.delete(user);
            this.players[user] = message.text;
            game.players.push(this.manager.createPlayer(
                user, message.from.username
            ));
            await this.sendMessageToGroup({
                from: message.from,
                text: "Attenzione! " + message.from.username + " si è " +
                    "aggiunto alla partita"
            });
            if (game.players.length === game.nPlayers) {
                await this.startGame(message.text);
            }
        } else {
            await this.sendMessage(user, "Mi dispiace, questa " +
                "partita non esiste\\. Riprova ad incollare l'identificativo " +
                "o esci usando /exit");
        }
    }

    async exit(user) {
        this.waitingForEnter.delete(user);
        const gameId = this.players[user];
        if (gameId) {
            const index2 = -1;
            let count = 0;
            for (const u of this.games[gameId].players) {
                if (u.id === user) {
                    index2 = count;
                    break;
                }
            }
            if (index2 > -1) {
                this.games[gameId].players.splice(index2, 1);
            }
            if (this.games[gameId].players.length === 0) {
                delete this.games[gameId];
            }
        }
        delete this.players[user];
        return await this.sendMessage(user, "Operazione completata");
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

    // asd
    async troll(message) {
        const button1 = this.buildButton("dio cannone", {dio: "cannone"});
        const button2 = this.buildButton("madonna legna", {madonna: "legna"})
        const keyboard = this.buildKeyboard([button1, button2]);
        this.sendMessage(message.from.id, "scegli una bestemmia:", keyboard);
    }
}

module.exports = Telegram;