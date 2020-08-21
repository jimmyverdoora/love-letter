require('dotenv').config();
const express = require('express');
const cors = require('cors');
const parser = require('body-parser');
const { Telegram, WEBHOOK_PATH } = require('./telegram');

const app = express();
const tg = new Telegram();

app.use(parser.json());

app.use(cors());

app.post(WEBHOOK_PATH, (req, res) => {
    console.log(req);
    res.status(200).send();
});

app.listen(8443, () => {
  console.log('Listening to requests');
});