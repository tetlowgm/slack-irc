import _ from 'lodash';
import Bot from './bot.js';
import { ConfigurationError } from './errors.js';

/**
 * Reads from the provided config file and returns an array of bots
 * @return {object[]}
 */
export function createBots(configFile) {
  const bots = [];

  // The config file can be both an array and an object
  if (Array.isArray(configFile)) {
    configFile.forEach((config) => {
      const bot = new Bot(config);
      bot.connect();
      bots.push(bot);
    });
  } else if (_.isObject(configFile)) {
    const bot = new Bot(configFile);
    bot.connect();
    bots.push(bot);
  } else {
    throw new ConfigurationError();
  }

  return bots;
}

/**
 * Removes IRC in-band formatting: mIRC colours (\x03 followed by `fg[,bg]`), hex
 * colours (\x04RRGGBB) and the single-byte toggles for bold, italic, underline,
 * reverse, monospace and reset, along with any other control character a client
 * may send. None of it means anything to Slack, and a message made up entirely of
 * these — a lone Ctrl+S, say — otherwise reaches chat.postMessage as empty text,
 * which the API rejects with `no_text`.
 * @return {string}
 */
export function stripIrcFormatting(text) {
  /* eslint-disable no-control-regex */
  return text
    .replace(/\x03\d{0,2}(?:,\d{0,2})?/g, '')
    .replace(/\x04[0-9a-fA-F]{6}/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '');
  /* eslint-enable no-control-regex */
}

/**
 * Returns occurances of a current channel member's name with `@${name}`
 * @return {string}
 */
export function highlightUsername(user, text) {
  const words = text.split(' ');
  const userRegExp = new RegExp(`^${user}[,.:!?]?$`);

  return words.map((word) => {
    // if the user is already prefixed by @, don't replace
    if (word.indexOf(`@${user}`) === 0) {
      return word;
    }

    // username match (with some chars)
    if (userRegExp.test(word)) {
      return `@${word}`;
    }

    return word;
  }).join(' ');
}
