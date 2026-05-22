const express = require('express');
require('dotenv').config();
const activity = require('./routes/activity');

const app = express();

app.use('/api', activity);

module.exports = app;
