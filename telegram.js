const axios = require('axios');

const TELEGRAM_URL = 'https://api.telegram.org/bot' + process.env.BOT_SECRET;

class Telegram {

    constructor() {
        this.games = {}; // gameId: gameObj
        this.players = {}; // userId: gameId
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
        if (body.message.text.charAt(0) === '/') {
            return await this.elaborateCommand(body.message);
        } else {
            return await this.sendMessageToGroup(body.message);
        }
    }

    async elaborateCommand(message) {
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
}

module.exports = Telegram;