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
        this.games[this.players[user.id]] = this.manager.createNewGame(5,
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
            await this.sendMessage(user, this.manager.getStatus(this.games[gameId], user));
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
        await this.sendMessageToGroup({ gameId, text: "Tocca a " + player.name });
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
            await this.sendMessageToGroup({
                gameId, text: "Game over\\! Ha vinto " +
                    game.players[actives[0]].name
            });
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
        const game = this.games[this.players[user.id]];
        const name = this.manager.getPlayerNameFromId(target, game);
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text: `${user.username} sceglie ${name} come cancelliere\\.`
        });
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
        this.games[this.players[user.id]] = game;
        await this.sendMessage(user.id, `${value === 'N' ? 'Non hai' : 'Hai' } approvato il cancelliere`);
        if (this.manager.everyOneVoted(game)) {
            // todo...
        }
    }

    async handlePriest(userId) {
        const game = this.games[this.players[userId]];
        const buttons = [];
        for (const u of game.players) {
            if (u.state === 'in' && u.id !== userId) {
                buttons.push([this.buildButton(u.name, `priest:${u.id}`)]);
            }
        }
        buttons.push([this.buildButton("PASSA", 'priest:PASS')]);
        return await this.sendMessage(userId, "Scegli il giocatore",
            this.buildKeyboard(buttons));
    }

    async handlePriest1(target, user) {
        const game = this.games[this.players[user.id]];
        this.games[this.players[user.id]] = this.manager.play(game, 2);
        let text, text2;
        if (target !== 'PASS') {
            const player = game.players[this.manager.getPlayerIndexFromId(target, game)];
            text = `Il Prete di ${user.username} guarda la mano a ${player.name}`;
            text2 = `${player.name} ha in mano ${this.style(player.hand[0])}`;
        } else {
            text = `Il Prete di ${user.username} non fa nulla`;
        }
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text
        });
        if (text2) {
            await this.sendMessage(user.id, text2);
        }
        return await this.handlePostPlayEvents(game.id);
    }

    async handleBaron(userId) {
        const game = this.games[this.players[userId]];
        const buttons = [];
        for (const u of game.players) {
            if (u.state === 'in' && u.id !== userId) {
                buttons.push([this.buildButton(u.name, `baron:${u.id}`)]);
            }
        }
        buttons.push([this.buildButton("PASSA", 'baron:PASS')]);
        return await this.sendMessage(userId, "Scegli il giocatore",
            this.buildKeyboard(buttons));
    }

    async handleBaron1(target, user) {
        let game = this.games[this.players[user.id]];
        game = this.manager.play(game, 3);
        let text;
        if (target !== 'PASS') {
            user = game.players[this.manager.getPlayerIndexFromId(user.id, game)];
            const player = game.players[this.manager.getPlayerIndexFromId(target, game)];
            if (user.hand[0].number > player.hand[0].number) {
                text = `${user.name} usa un Barone contro ${player.name}\\. La carta di ${user.name} rekta ` +
                    `${this.style(player.hand[0])} di ${player.name}\\!`;
                game = this.manager.eliminatePlayer(player.id, game);
            } else if (user.hand[0].number < player.hand[0].number) {
                text = `${user.name} usa un Barone contro ${player.name}\\. La carta di ${player.name} rekta ` +
                    `${this.style(user.hand[0])} di ${user.name}\\!`;
                game = this.manager.eliminatePlayer(user.id, game);
            } else {
                text = `${user.name} usa un Barone contro ${player.name}\\. La carte di ${user.name} e ` +
                    `${player.name} sono uguali\\!`;
            }
        } else {
            text = `Il Barone di ${user.username} non fa nulla`;
        }
        this.games[this.players[user.id]] = game;
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text
        });
        return await this.handlePostPlayEvents(game.id);
    }

    async handleAncel(userId) {
        const game = this.games[this.players[userId]];
        this.games[this.players[userId]] = this.manager.play(game, 4);
        const index = this.manager.getPlayerIndexFromId(userId, game);
        const player = game.players[index];
        const text = `La Ancella di ${player.name} protegge fino al prossimo turno`;
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text
        });
        return await this.handlePostPlayEvents(game.id);
    }

    async handlePrince(userId) {
        const game = this.games[this.players[userId]];
        const buttons = [];
        for (const u of game.players) {
            if (u.state === 'in' && u.id !== userId) {
                buttons.push([this.buildButton(u.name, `prince:${u.id}`)]);
            }
        }
        buttons.push([this.buildButton("PASSA", 'prince:PASS')]);
        return await this.sendMessage(userId, "Scegli il giocatore",
            this.buildKeyboard(buttons));
    }

    async handlePrince1(target, user) {
        let game = this.games[this.players[user.id]];
        game = this.manager.play(game, 5);
        let text, text2;
        if (target !== 'PASS') {
            const playerIndex = this.manager.getPlayerIndexFromId(target, game);
            const playerName = game.players[playerIndex].name;
            game = this.manager.discard(game, playerIndex);
            const discarded = game.players[playerIndex].pile.slice(-1)[0];
            text = `Il Principe di ${user.username} elimina ${this.style(discarded)} di ${playerName}`;
            if (discarded.number == 8) {
                text += `\n${playerName} ha scartato la Principessa\\. Get rekt\\!`;
                game.players[playerIndex].state = 'out';
            } else if (game.deck.length === 0) {
                text += `\n${playerName} non puo' pescare perche' il mazzo e' finito\\. Get rekt\\!`;
                game.players[playerIndex].state = 'out';
            } else {
                const cardDrown = this.manager.draw(game);
                game.players[playerIndex].hand.push(cardDrown);
                text2 = `Hai pescato ${this.style(cardDrown)}`;
            }
        } else {
            text = `Il Principe di ${user.username} non fa nulla`;
        }
        this.games[this.players[user.id]] = game;
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text
        });
        if (text2) {
            await this.sendMessage(target, text2);
        }
        return await this.handlePostPlayEvents(game.id);
    }

    async handleKing(userId) {
        const game = this.games[this.players[userId]];
        const buttons = [];
        for (const u of game.players) {
            if (u.state === 'in' && u.id !== userId) {
                buttons.push([this.buildButton(u.name, `king:${u.id}`)]);
            }
        }
        buttons.push([this.buildButton("PASSA", 'king:PASS')]);
        return await this.sendMessage(userId, "Scegli il giocatore",
            this.buildKeyboard(buttons));
    }

    async handleKing1(target, user) {
        let game = this.games[this.players[user.id]];
        game = this.manager.play(game, 6);
        let text, textTarget, textUser;
        if (target !== 'PASS') {
            const playerIndex = this.manager.getPlayerIndexFromId(target, game);
            const playerName = game.players[playerIndex].name;
            const userIndex = this.manager.getPlayerIndexFromId(user.id, game);
            game = this.manager.swapHands(playerIndex, userIndex, game);
            const givenToPlayer = game.players[playerIndex].hand[0];
            const givenToUser = game.players[userIndex].hand[0];
            text = `Il Re di ${user.username} scambia la sua carta con quella di ${playerName}`;
            textTarget = `Hai scambiato ${this.style(givenToUser)} per ${this.style(givenToPlayer)}`;
            textUser = `Hai scambiato ${this.style(givenToPlayer)} per ${this.style(givenToUser)}`;
        } else {
            text = `Il Re di ${user.username} non fa nulla`;
        }
        this.games[this.players[user.id]] = game;
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text
        });
        if (textTarget) {
            await this.sendMessage(target, textTarget);
        }
        if (textUser) {
            await this.sendMessage(user.id, textUser);
        }
        return await this.handlePostPlayEvents(game.id);
    }

    async handleContess(userId) {
        let game = this.games[this.players[userId]];
        game = this.manager.play(game, 7);
        const index = this.manager.getPlayerIndexFromId(userId, game);
        const player = game.players[index];
        const text = `${player.name} ha scartato la Contessa\\.\\.\\.`;
        this.games[this.players[userId]] = game;
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text
        });
        return await this.handlePostPlayEvents(game.id);
    }

    async handlePrincess(userId) {
        let game = this.games[this.players[userId]];
        game = this.manager.play(game, 8);
        const index = this.manager.getPlayerIndexFromId(userId, game);
        const player = game.players[index];
        const text = `${player.name} ha scartato la Principessa\\. Get rekt\\!`;
        game.players[index].state = 'out';
        this.games[this.players[userId]] = game;
        const gameId = game.id;
        await this.sendMessageToGroup({
            gameId, text
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

    styleFromNumber(cardNumber) {
        const deck = generateDeck();
        for (const card of deck) {
            if (card.number === cardNumber) {
                return this.style(card);
            }
        }
        return '';
    }

    style(role) {
        return role === 'H' ? 'Hitler' : role === 'B' ? 'un Cattivo' : 'un Buono';
    }
}

module.exports = Telegram;
