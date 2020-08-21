const axios = require('axios');

const TELEGRAM_URL = 'https://api.telegram.org/bot' + process.env.BOT_SECRET;

class Telegram {

    constructor() {
        this.games = {"123": { players: [{id: 58968385}] }}; // gameId: gameObj
        this.players = {58968385: "123"}; // userId: gameId
    }

    async tg(path, payload) {
        return await axios.post(TELEGRAM_URL + path, payload);
    }

    async elaborate(body) {
        if (body.message.text.charAt(0) === '/') {
            return await this.elaborateCommand(body.message);
        } else {
            return await this.sendMessageToGroup(body.message);
        }
    }

    async sendMessageToGroup(message) {
        const text = '*' + message.from.username + ":*\n" + message.text;
        const game = this.getGame(message);
        for (let player of game.players) {
            if (player.id === message.from.id) { // TODO: diverso
                await this.tg('/sendMessage', {
                    chat_id: player.id,
                    text
                    parse_mode: 'MarkdownV2'
                })
            }
        }
    }

    getGame(message) {
        return this.games[this.players[message.from.id]];
    }
}

module.exports = Telegram;