#!/usr/bin/env node
import winston from 'winston';
import { fileURLToPath } from 'url';

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
// Under ESM there is no module.parent, so compare against the entry point:
// otherwise importing this package as a library would launch the CLI.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // cli() is async, so a config failure would otherwise surface as an
  // unhandled rejection rather than a readable startup error.
  cli().catch((error) => {
    logger.error('Failed to start', error);
    process.exit(1);
  });
}

export default createBots;
