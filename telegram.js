const axios = require('axios');

const TELEGRAM_URL = 'https://api.telegram.org/bot' + process.env.BOT_SECRET;
const WEBHOOK_PATH = '/api/' + process.env.APP_SECRET;

class Telegram {

    async tg(path, payload) {
        return await axios.post(TELEGRAM_URL + path, payload);
    }
}

module.exports = { Telegram, WEBHOOK_PATH };