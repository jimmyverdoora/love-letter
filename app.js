require('dotenv').config();
const express = require('express');
const cors = require('cors');
const parser = require('body-parser');
const Telegram = require('./loveletter/telegram');
const HTelegram = require('./hitler/telegram');

const WEBHOOK_URL = '/api/' + process.env.APP_SECRET;
const HITLER_WEBHOOK_URL = '/api/' + process.env.HITLER_APP_SECRET;

const app = express();
const telegram = new Telegram();
const hTelegram = new HTelegram();

app.use(parser.json());

app.use(cors());

app.post(WEBHOOK_URL, async (req, res) => {
  await telegram.elaborate(req.body);
  res.status(200).send();
});

app.post(HITLER_WEBHOOK_URL, async (req, res) => {
  console.log('pre')
  console.log(hTelegram.players);
  await hTelegram.elaborate(req.body);
  console.log('post')
  console.log(hTelegram.players);
  res.status(200).send();
});

setInterval(() => console.log(hTelegram.players), 500);

app.listen(process.env.PORT, () => {
  console.log('Listening to requests');
});