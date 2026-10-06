import _ from 'lodash';
import irc from 'irc-upd';
import winston from 'winston';
import boltpkg from '@slack/bolt';

import { ConfigurationError } from './errors.js';
import emojis from '../assets/emoji.json' with { type: 'json' };
import { validateChannelMapping } from './validators.js';
import { highlightUsername, stripIrcFormatting } from './helpers.js';

// @slack/bolt is CommonJS, so it has to be destructured rather than named-imported.
const { App } = boltpkg;

const ALLOWED_SUBTYPES = ['me_message', 'file_share'];
const REQUIRED_FIELDS = [
  'server', 'nickname', 'channelMapping',
  'slack_bot_token', 'slack_signing_secret', 'slack_app_token'
];

// Easter egg. A lone Ctrl+S is what used to reach chat.postMessage as empty text
// and take the bridge down with it (see stripIrcFormatting); one particular nick
// enjoyed finding that out. Built with fromCharCode because a literal control
// character in source is invisible and gets mangled by editors and diffs.
const CTRL_S = String.fromCharCode(0x13);
const TROUBLE_NICK = 'trouble';
const KICK_MESSAGE = 'stop trying to crash me';
// Channel prefixes that come with the power to kick: owner, admin, op, halfop.
const KICK_PREFIXES = ['~', '&', '@', '%'];

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * An IRC bot, works as a middleman for all communication
 * @param {object} options
 */
class Bot {
  constructor(options) {
    REQUIRED_FIELDS.forEach((field) => {
      if (!options[field]) {
        throw new ConfigurationError(`Missing configuration field ${field}`);
      }
    });

    validateChannelMapping(options.channelMapping);

    const app = this.createSlackApp(options);
    const web = app.client;
    this.slack = { web, app };

    this.server = options.server;
    this.nickname = options.nickname;
    this.ircOptions = options.ircOptions;
    this.ircStatusNotices = options.ircStatusNotices || {};
    this.commandCharacters = options.commandCharacters || [];
    this.channels = _.values(options.channelMapping);
    this.muteSlackbot = options.muteSlackbot || false;
    this.muteUsers = {
      slack: [],
      irc: [],
      ...options.muteUsers
    };

    const defaultUrl = 'http://api.adorable.io/avatars/48/$username.png';
    // Disable if it's set to false, override default with custom if available:
    this.avatarUrl = options.avatarUrl !== false && (options.avatarUrl || defaultUrl);
    this.slackUsernameFormat = options.slackUsernameFormat || '$username (IRC)';
    this.ircUsernameFormat = options.ircUsernameFormat == null ?
      '<$username> ' : options.ircUsernameFormat;
    this.channelMapping = {};

    // Remove channel passwords from the mapping and lowercase IRC channel names
    _.forOwn(options.channelMapping, (ircChan, slackChan) => {
      this.channelMapping[slackChan] = ircChan.split(' ')[0].toLowerCase();
    }, this);

    this.invertedMapping = _.invert(this.channelMapping);
    this.autoSendCommands = options.autoSendCommands || [];
  }

  // Split out so tests can substitute a stub app: constructing a real one opens a
  // socket and fires auth.test against Slack.
  createSlackApp(options) {
    return new App({
      token: options.slack_bot_token,
      signingSecret: options.slack_signing_secret,
      socketMode: true,
      appToken: options.slack_app_token
    });
  }

  // Put api call results into the JavaScript object
  saveRes(resArray) {
    const map = {};
    map.id_to_name = {};
    map.id_to_obj = {};
    map.name_to_id = {};
    map.name_to_obj = {};
    resArray.forEach(function (obj) {
      map.id_to_name[obj['id']] = obj['name'];
      map.id_to_obj[obj['id']] = obj;
      map.name_to_id[obj['name']] = obj['id'];
      map.name_to_obj[obj['name']] = obj;
    });
    return map;
  }

  async cacheIDs(reskey, resprom) {

    // Wait for results from the web-api call
    const result = await resprom;
    return this.saveRes(result[reskey]);
  }

  async connect() {
    logger.debug('Connecting to IRC and Slack');
    await this.slack.app.start();
    logger.info('Connected to Slack');

    this.slack.chan = await this.cacheIDs('channels', this.slack.web.conversations.list());
    this.slack.user = await this.cacheIDs('members', this.slack.web.users.list());
    logger.info(`Cached ${Object.keys(this.slack.chan.id_to_name).length} Slack channels and ` +
      `${Object.keys(this.slack.user.id_to_name).length} Slack users`);

    logger.info(`Connecting to IRC server ${this.server} as ${this.nickname}`);

    const ircOptions = {
      userName: this.nickname,
      realName: this.nickname,
      channels: this.channels,
      floodProtection: true,
      floodProtectionDelay: 500,
      retryCount: 10,
      ...this.ircOptions
    };

    this.ircClient = new irc.Client(this.server, this.nickname, ircOptions);
    this.attachListeners();
  }

  attachListeners() {
    this.ircClient.on('registered', (message) => {
      logger.debug('Registered event: ', message);
      logger.info(`Connected to IRC server ${this.server} as ${this.ircClient.nick}`);
      this.autoSendCommands.forEach((element) => {
        this.ircClient.send(...element);
      });
    });

    this.ircClient.on('error', (error) => {
      logger.error('Received error event from IRC', error);
    });

    this.ircClient.on('abort', () => {
      logger.error('Maximum IRC retry count reached, exiting.');
      process.exit(1);
    });

    this.slack.app.message('', async ({ message }) => {
      // Ignore bot messages and people leaving/joining
      if (message.type === 'message' &&
        (!message.subtype || ALLOWED_SUBTYPES.indexOf(message.subtype) > -1)) {
        this.sendToIRC(message);
      }
    });

    this.ircClient.on('message', this.sendToSlack.bind(this));

    this.ircClient.on('notice', (author, to, text) => {
      const formattedText = `*${text}*`;
      this.sendToSlack(author, to, formattedText);
    });

    this.ircClient.on('action', (author, to, text) => {
      const formattedText = `_${text}_`;
      this.sendToSlack(author, to, formattedText);
    });

    this.ircClient.on('invite', (channel, from) => {
      logger.debug('Received invite:', channel, from);
      if (!this.invertedMapping[channel]) {
        logger.debug('Channel not found in config, not joining:', channel);
      } else {
        this.ircClient.join(channel);
        logger.debug('Joining channel:', channel);
      }
    });

    this.ircClient.on('join', (channel, nick) => {
      if (nick === this.ircClient.nick) {
        logger.info(`Joined IRC channel ${channel}`);
      }
    });

    if (this.ircStatusNotices.join) {
      this.ircClient.on('join', (channel, nick) => {
        if (nick !== this.nickname) {
          this.sendToSlack(this.nickname, channel, `*${nick}* has joined the IRC channel`);
        }
      });
    }

    if (this.ircStatusNotices.leave) {
      this.ircClient.on('part', (channel, nick) => {
        this.sendToSlack(this.nickname, channel, `*${nick}* has left the IRC channel`);
      });

      this.ircClient.on('quit', (nick, reason, channels) => {
        channels.forEach((channel) => {
          this.sendToSlack(this.nickname, channel, `*${nick}* has quit the IRC channel`);
        });
      });
    }
  }

  parseText(text) {
    return text
      .replace(/\n|\r\n|\r/g, ' ')
      .replace(/<!channel>/g, '@channel')
      .replace(/<!group>/g, '@group')
      .replace(/<!everyone>/g, '@everyone')
      .replace(/<#(C\w+)\|?(\w+)?>/g, (match, channelId, readable) => {
        const name = this.slack.chan.id_to_name[channelId];
        return readable || `#${name}`;
      })
      .replace(/<@(U\w+)\|?(\w+)?>/g, (match, userId, readable) => {
        const name = this.slack.user.id_to_name[userId];
        return readable || `@${name}`;
      })
      .replace(/<(?!!)([^|]+?)>/g, (match, link) => link)
      .replace(/<!(\w+)\|?(\w+)?>/g, (match, command, label) =>
        `<${label || command}>`
      )
      .replace(/:(\w+):/g, (match, emoji) => {
        if (emoji in emojis) {
          return emojis[emoji];
        }

        return match;
      })
      .replace(/<.+?\|(.+?)>/g, (match, readable) => readable)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  isCommandMessage(message) {
    return this.commandCharacters.indexOf(message[0]) !== -1;
  }

  sendToIRC(message) {
    const channel = this.slack.chan.id_to_obj[message.channel];
    if (!channel) {
      logger.info(`Received message from a channel the bot isn't in: ${message.channel}`);
      return;
    }

    if (this.muteSlackbot && message.user === 'USLACKBOT') {
      logger.debug(`Muted message from Slackbot: "${message.text}"`);
      return;
    }

    const user = this.slack.user.id_to_obj[message.user];
    const username = this.ircUsernameFormat.replace(/\$username/g, user.name);

    if (this.muteUsers.slack.indexOf(user.name) !== -1) {
      logger.debug(`Muted message from Slack ${user.name}: ${message.text}`);
      return;
    }

    const channelName = channel.is_channel ? `#${channel.name}` : channel.name;
    const ircChannel = this.channelMapping[channelName];

    logger.debug(`Channel Mapping ${channelName} ${ircChannel}`);
    if (ircChannel) {
      let text = this.parseText(message.text);

      if (this.isCommandMessage(text)) {
        const prelude = `Command sent from Slack by ${user.name}:`;
        this.ircClient.say(ircChannel, prelude);
      } else if (!message.subtype) {
        text = `${username}${text}`;
      } else if (message.subtype === 'file_share') {
        text = `${username}File uploaded ${message.file.permalink}`
          + ` / ${message.file.permalink_public}`;
        if (message.file.initial_comment) {
          text += ` - ${message.file.initial_comment.comment}`;
        }
      } else if (message.subtype === 'me_message') {
        text = `Action: ${user.name} ${text}`;
      }
      logger.debug('Sending message to IRC', channelName, text);
      this.ircClient.say(ircChannel, text);
    }
  }

  /**
   * True if the bot holds a channel prefix that lets it kick. irc-upd tracks every
   * channel's members as nick -> the prefix characters they carry, so this is a
   * lookup rather than a round trip to the server. `nick` rather than `nickname`
   * because the bot may have been renamed since it connected.
   * @return {boolean}
   */
  canKick(channel) {
    const chan = this.ircClient.chans?.[channel.toLowerCase()];
    const modes = chan?.users?.[this.ircClient.nick || this.nickname];
    return !!modes && KICK_PREFIXES.some(prefix => modes.includes(prefix));
  }

  /**
   * Easter egg: `trouble` knows exactly what a lone Ctrl+S used to do to this bot,
   * so a message from that nick with nothing in it but one earns a kick — never a
   * ban, and only where the bot has the ops to do it.
   * @return {boolean} whether the kick was sent
   */
  kickTroublemaker(author, channel, text) {
    if (author.toLowerCase() !== TROUBLE_NICK || !text.includes(CTRL_S)) return false;

    if (!this.canKick(channel)) {
      logger.debug(`Not opped in ${channel}, letting ${author} off with it`);
      return false;
    }

    logger.info(`Kicking ${author} from ${channel} for trying to crash the bridge`);
    this.ircClient.send('KICK', channel, author, KICK_MESSAGE);
    return true;
  }

  sendToSlack(author, channel, text) {
    // Slack rejects a post whose text is empty, so anything that is only IRC
    // formatting or control characters has to be dropped rather than relayed.
    const cleanText = stripIrcFormatting(text);
    if (!cleanText.trim()) {
      this.kickTroublemaker(author, channel, text);
      logger.debug(`Ignoring message from IRC ${author} with no displayable text`);
      return Promise.resolve();
    }

    const slackChannelName = this.invertedMapping[channel.toLowerCase()];
    if (!slackChannelName) return Promise.resolve();

    const name = slackChannelName.replace(/^#/, '');
    const slackChannel = this.slack.chan.name_to_obj[name];

    // If it's a private group and the bot isn't in it, we won't find anything here.
    // If it's a channel however, we need to check is_member.
    if (!slackChannel || (!slackChannel.is_member && !slackChannel.is_group)) {
      logger.info(`Tried to send a message to a channel the bot isn't in: ${slackChannelName}`);
      return Promise.resolve();
    }

    if (this.muteUsers.irc.indexOf(author) !== -1) {
      logger.debug(`Muted message from IRC ${author}: ${text}`);
      return Promise.resolve();
    }

    return this.slack.web.conversations.members({ channel: slackChannel.id }).then((resp) => {
      const currentChannelUsernames = resp.members.map(member =>
        this.slack.user.id_to_name[member]
      );

      const mappedText = currentChannelUsernames.reduce((current, username) =>
        highlightUsername(username, current)
      , cleanText);

      let iconUrl;
      if (author !== this.nickname && this.avatarUrl) {
        iconUrl = this.avatarUrl.replace(/\$username/g, author);
      }

      logger.debug('Sending message to Slack', mappedText, channel, '->', slackChannelName);
      // 2025-04-16: Slack stopped letting the bot masquarade thereby losing who said what on the
      //             channel. As a fix, I prefaced the text with the author. Slack fixed it the
      //             next day and I reverted it. Memorializing the "change" here for my future self.
      // text: `<${author}> ${mappedText}`,
      return this.slack.web.chat.postMessage({
        channel: slackChannel.id,
        text: mappedText,
        username: this.slackUsernameFormat.replace(/\$username/g, author),
        parse: 'full',
        icon_url: iconUrl
      });
    }).catch((error) => {
      // An unhandled rejection here takes the whole bridge down with it.
      logger.error('Error sending message to Slack', error);
    });
  }
}

export default Bot;
