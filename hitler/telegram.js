const axios = require('axios');
const GameManager = require('./game');
const HELP_TEXT = require('./help');
const RED = '🔴';
const BLACK = '⚫';

const GAME_LIMIT = 16;
const TELEGRAM_URL = 'https://api.telegram.org/bot' + process.env.HITLER_BOT_SECRET;

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
        } else if (!body.message || !body.message.text) {
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
        } else if (message === 'status') {
            await this.status(fullMessage.from.id);
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
        if (command === 'join') {
            return await this.tryJoinTheRoom(value, query.from);
        } else if (command === 'cancelor') {
            return await this.handleCancelor(value, query.from);
        } else if (command === 'approve') {
            return await this.handleApprove(value, query.from);
        } else if (command === 'discard') {
            return await this.handleDiscard(value, query.from);
        } else if (command === 'play') {
            return await this.handlePlay(value, query.from);
        }
    }

    async createNewGame(message) {
        const user = message.from;
        if (this.players[user.id]) {
            return await this.negateThisBecauseAlreadyInGame(user.id);
        } else if (Object.keys(this.games).length > GAME_LIMIT) {
            return await this.sendMessage(user.id, "Siamo pieni\\! Purtroppo non " +
                "si possono creare più di " + GAME_LIMIT + " partite");
        }
        const id = this.manager.createGameId();
        this.players[user.id] = id;
        this.games[this.players[user.id]] = this.manager.createNewGame(5,
            this.players[user.id]);
        this.games[this.players[user.id]].players.push(
            this.manager.createPlayer(user.id, user.username));
        await this.sendMessage(user.id, "Invita gli altri giocatori con " +
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
            this.buildKeyboard(buttons));
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

    async status(user) {
        const gameId = this.players[user];
        if (gameId && this.games[gameId]) {
            await this.sendMessage(user, this.manager.getStatus(this.games[gameId]));
        } else {
            await this.sendMessage(user, "Non stai partecipando a nessuna partita");
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
                count += 1;
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
        await this.sendMessageToGroup({ text: "Game over\\!", gameId });
        return this.endGame(gameId);
    }

    async startGame(gameId) {
        this.games[gameId] = this.manager.startGame(this.games[gameId]);
        await this.sendMessageToGroup(
            { gameId, text: "Che il gioco abbia inizio\\!" });
        const player = this.manager.getActivePlayer(this.games[gameId]);
        const hitler = this.manager.getHitler(this.games[gameId]);
        for (const p of this.games[gameId].players) {
            await this.sendMessage(p.id, "Sei " + this.style(p.role));
            if (p.role === 'B') {
                await this.sendMessage(p.id, "Hitler e' " + hitler.name);
            }
        }
        await this.sendMessageToGroup({ gameId, text: "Il presidente e' " + player.name });
        return await this.askActivePlayerWhatToPlay(player);
    }

    async askActivePlayerWhatToPlay(player) {
        const buttons = [];
        const game = this.games[this.players[player.id]];
        for (const u of game.players) {
            if (u.id !== player.id) {
                buttons.push([this.buildButton(u.name, `cancelor:${u.id}`)]);
            }
        }
        return await this.sendMessage(player.id, "Scegli il cancelliere",
            this.buildKeyboard(buttons));
    }

    async handlePostPlayEvents(gameId) {
        let game = this.games[gameId];
        if (game.reds === 5) {
            await this.sendMessageToGroup({
                gameId, text: "Game over\\! Hanno vinto i Buoni\\!"
            });
            return this.endGame(gameId);
        }
        if (game.blacks === 6) {
            await this.sendMessageToGroup({
                gameId, text: "Game over\\! Hanno vinto i Cattivi\\!"
            });
            return this.endGame(gameId);
        }
        game = this.manager.progress(game);
        this.games[gameId] = game;
        const player = this.manager.getActivePlayer(game);
        await this.sendMessageToGroup({ gameId, text: "Il presidente e' " + player.name });
        return await this.askActivePlayerWhatToPlay(
            game.players[game.activePlayer]);
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

    // ----------------- ACTIONS

    async handleCancelor(target, user) {
        let game = this.games[this.players[user.id]];
        const name = this.manager.getPlayerNameFromId(target, game);
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text: `${user.username} sceglie ${name} come cancelliere\\.`
        });
        this.games[gameId] = this.manager.setCancelor(target, game);
        const buttons = [[this.buildButton('SI', 'approve:Y'), this.buildButton('NO', 'approve:N')]];
        for (const u of game.players) {
            await this.sendMessage(u.id, `Approvi ${name}?`,
                this.buildKeyboard(buttons));
        }
    }

    async handleApprove(value, user) {
        let game = this.games[this.players[user.id]];
        const playerIndex = this.manager.getPlayerIndexFromId(user.id, game);
        if (game.players[playerIndex].currentVote) {
            return await this.sendMessage(user.id, "Hai gia' votato\\!");
        }
        game.players[playerIndex].currentVote = value;
        this.games[game.id] = game;
        await this.sendMessage(user.id, `${value === 'N' ? 'Non hai' : 'Hai'} approvato il cancelliere`);
        if (!this.manager.everyOneVoted(game)) {
            return;
        }
        const { y, n } = this.manager.getVotes(game);
        game = this.manager.cleanVotes(game);
        const cancName = game.players[game.cancelor].name;
        if (y <= n) {
            this.games[game.id] = game;
            await this.sendMessageToGroup({
                gameId: game.id,
                text: `${cancName} non e' stato approvato (${y} vs ${n})`
            });
            return await this.handlePostPlayEvents(game.id);
        }
        game = this.manager.draw3forPresident(game);
        this.games[game.id] = game;
        await this.sendMessageToGroup({
            gameId: game.id,
            text: `${cancName} e' stato approvato (${y} vs ${n})`
        });
        const buttons = [];
        game.players[game.activePlayer].hand.forEach(card => buttons.push(
            card ? this.buildButton(RED, 'discard:1') : this.buildButton(BLACK, 'discard:0')
        ));
        const keyboard = this.buildKeyboard([buttons]);
        return await this.sendMessage(game.players[game.activePlayer].id,
            'Scegli la carta da NON passare al cancelliere', keyboard);
    }

    async handleDiscard(value, user) {
        let game = this.games[this.players[user.id]];
        if (!game.cancelor) {
            return await this.sendMessage(user.id, "In cancelliere non e' ancora stato eletto\\!");
        }
        if (game.players[game.activePlayer].id != user.id) {
            return await this.sendMessage(user.id, "Non sei il presidente\\!");
        }
        this.games[game.id] = this.manager.pass2toCancelor(game, parseInt(value));
        await this.sendMessageToGroup({
            gameId: game.id,
            text: `${cancName} riceve 2 carte da ${user.username}\\.\\.\\.`
        });
        const buttons = [];
        game.players[game.cancelor].hand.forEach(card => buttons.push(
            card ? this.buildButton(RED, 'play:1') : this.buildButton(BLACK, 'play:0')
        ));
        const keyboard = this.buildKeyboard([buttons]);
        return await this.sendMessage(game.players[game.cancelor].id, 'Che legge approvi?', keyboard);
    }

    async handlePlay(value, user) {
        let game = this.games[this.players[user.id]];
        if (!game.cancelor) {
            return await this.sendMessage(user.id, "In cancelliere non e' ancora stato eletto\\!");
        }
        if (game.players[game.cancelor].id != user.id) {
            return await this.sendMessage(user.id, "Non sei il cancelliere\\!");
        }
        this.games[game.id] = this.manager.play(game, parseInt(value));
        await this.sendMessageToGroup({
            gameId: game.id,
            text: `${cancName} approva una legge ${parseInt(value) ? RED : BLACK}\\!`
        });
        return await this.handlePostPlayEvents(game.id);
    }

    // -----------------------

    endGame(gameId) {
        if (this.games[gameId]) {
            for (const p of this.games[gameId].players) {
                delete this.players[p.id];
            }
            delete this.games[gameId];
        }
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
            inline_keyboard: buttons
        };
    }

    style(role) {
        return role === 'H' ? 'Hitler' : role === 'B' ? 'un Cattivo' : 'un Buono';
    }
}

module.exports = Telegram;
