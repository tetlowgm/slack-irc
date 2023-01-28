#!/usr/bin/env node
import winston from 'winston';
import module from 'module';

import { createBots } from './helpers.js';
import cli from './cli.js';

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
  cli();
}

export default createBots;
