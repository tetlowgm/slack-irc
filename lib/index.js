#!/usr/bin/env node
import { createBots } from './helpers';

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ]
});


/* istanbul ignore next */
if (process.env.NODE_ENV === 'development') {
  logger.level = 'debug';
}

/* istanbul ignore next */
if (!module.parent) {
  const cli = require('./cli');
  cli();
}

export default createBots;
