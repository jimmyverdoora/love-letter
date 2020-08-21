require('dotenv').config();
const express = require('express');
const cors = require('cors');
const parser = require('body-parser');
const Telegram = require('./telegram');

const WEBHOOK_URL = '/api/' + process.env.APP_SECRET;

const app = express();
const tg = new Telegram();

app.use(parser.json());

app.use(cors());

app.post(WEBHOOK_URL, (req, res) => {
    console.log(req);
    res.status(200).send();
});

app.listen(443, () => {
  console.log('Listening to requests');
});