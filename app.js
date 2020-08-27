require('dotenv').config();
const express = require('express');
const cors = require('cors');
const parser = require('body-parser');
const Telegram = require('./telegram');

const WEBHOOK_URL = '/api/' + process.env.APP_SECRET;

const app = express();
const telegram = new Telegram();

app.use(parser.json());

app.use(cors());

app.post(WEBHOOK_URL, async (req, res) => {
    console.log(req);
    await telegram.elaborate(req.body);
    console.log(telegram);
    res.status(200).send();
});

app.listen(process.env.PORT, () => {
  console.log('Listening to requests');
});