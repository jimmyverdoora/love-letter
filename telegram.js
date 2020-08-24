const axios = require('axios');
const GameManager = require('./game');

const TELEGRAM_URL = 'https://api.telegram.org/bot' + process.env.BOT_SECRET;

class Telegram {

    constructor() {
        this.games = {}; // gameId: gameObj
        this.players = {}; // userId: gameId
        this.manager = new GameManager();
    }

    // -------------------------------------------------------------------------
    // Telegram interface ------------------------------------------------------
    // -------------------------------------------------------------------------

    async tg(path, payload) {
        return await axios.post(TELEGRAM_URL + path, payload);
    }

    async sendMessage(to, text) {
        return await this.tg('/sendMessage', {
            chat_id: to,
            text,
            parse_mode: 'MarkdownV2'
        })
    }

    // -------------------------------------------------------------------------
    // Other methods -----------------------------------------------------------
    // -------------------------------------------------------------------------

    async elaborate(body) {
        return await this.troll(body.message);
        if (body.message.text.charAt(0) === '/') {
            return await this.elaborateCommand(body.message.substring(1));
        } else {
            return await this.sendMessageToGroup(body.message);
        }
    }

    async elaborateCommand(message) {
        if (message === 'new') {
            // create new game and insert player (prompt nPlayers)
        } else if (message === 'join') {
            // join the game (show possible rooms)
        } else if (message === 'exit') {
            // exit
        } else if (message === '1') {
            // play first card (prompt action)
        } else if (message === '2') {
            // play second card (prompt action)
        } else {
            // reply wrong comand to player
        }
        return; // TODO
    }

    async sendMessageToGroup(message) {
        const text = '*' + message.from.username + ":*\n" + message.text;
        const game = this.getGame(message);
        for (let player of game.players) {
            if (player.id !== message.from.id) {
                await this.sendMessage(player.id, text);
            }
        }
    }

    getGame(message) {
        return this.games[this.players[message.from.id]];
    }

    // asd
    async troll(message) {
        const a = Math.random();
        if (a > 0.8) {
            return await this.sendMessage(message.from.id, "VI SCUOIO DIO MERDA");
        } else if ( a > 0.6) {
            return await this.sendMessage(message.from.id, "E' UNA MACCHINA DA GUERRA QUESTO COCCODRILLO");
        } else if (a > 0.4) {
            return await this.sendMessage(message.from.id, "FOOL OF A TUC");
        } else if (a > 0.2) {
            return await this.sendMessage(message.from.id, message.from.text + " sto cazzo");
        } else {
            return await this.sendMessage(message.from.id, message.from.text + " sarai tu dio tricheco");
        }
    }
}

module.exports = Telegram;