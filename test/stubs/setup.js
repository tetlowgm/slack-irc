import { use, should } from 'chai';
import sinonChai from 'sinon-chai';
import irc from 'irc-upd';
import Bot, { logger } from '../../lib/bot.js';
import SlackAppStub from './slack-stub.js';
import ClientStub from './irc-client-stub.js';

// chai 5 is ESM-only and exposes named exports rather than a default.
use(sinonChai);
should();

/**
 * Keeps Bot away from the network: a real Bolt App opens a socket and calls
 * auth.test, and a real irc Client dials out. Each Bot built afterwards gets its
 * own pair of stubs. Also silences the logger, which is otherwise very noisy.
 */
export function stubDependencies(sandbox) {
  sandbox.stub(Bot.prototype, 'createSlackApp').callsFake(() => new SlackAppStub());
  sandbox.stub(irc, 'Client').callsFake((server, nick) => new ClientStub(nick));

  return {
    info: sandbox.stub(logger, 'info'),
    debug: sandbox.stub(logger, 'debug'),
    error: sandbox.stub(logger, 'error')
  };
}

/** Builds a connected Bot with everything stubbed out. */
export async function createBot(config) {
  const bot = new Bot(config);
  await bot.connect();
  return bot;
}

export { Bot, SlackAppStub, ClientStub, logger };
