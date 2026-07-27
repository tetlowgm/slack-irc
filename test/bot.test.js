/* eslint-disable prefer-arrow-callback, no-unused-expressions */
import sinon from 'sinon';
import { createBot, stubDependencies } from './stubs/setup.js';
import { TEST_CHANNEL, TEST_USER } from './stubs/slack-stub.js';
import config from './fixtures/single-test-config.json' with { type: 'json' };

// Built with fromCharCode on purpose: literal control characters in source are
// invisible and get mangled by editors and diffs.
const CTRL_S = String.fromCharCode(0x13);
const BOLD = String.fromCharCode(0x02);
const UNDERLINE = String.fromCharCode(0x1f);
const COLOUR = String.fromCharCode(0x03);
const RESET = String.fromCharCode(0x0f);

describe('Bot', function () {
  const sandbox = sinon.createSandbox();

  // The Bolt handler keys off IDs, not names, so slack messages carry both.
  const slackMessage = (props = {}) => ({
    channel: TEST_CHANNEL.id,
    user: TEST_USER.id,
    ...props
  });

  beforeEach(async function () {
    this.logs = stubDependencies(sandbox);
    this.bot = await createBot(config);
    this.postMessage = this.bot.slack.web.chat.postMessage;
    this.say = this.bot.ircClient.say;
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should invert the channel mapping', function () {
    this.bot.invertedMapping['#irc'].should.equal('#slack');
  });

  describe('IRC to Slack', function () {
    it('should send correct message objects to slack', async function () {
      await this.bot.sendToSlack('testuser', '#irc', 'testmessage');
      this.postMessage.should.have.been.calledWithExactly({
        channel: TEST_CHANNEL.id,
        text: 'testmessage',
        username: 'testuser (IRC)',
        parse: 'full',
        icon_url: 'http://api.adorable.io/avatars/48/testuser.png'
      });
    });

    it('should lowercase channel names before sending to slack', async function () {
      await this.bot.sendToSlack('testuser', '#IRC', 'testmessage');
      this.postMessage.should.have.been.called;
    });

    it('should send messages to slack groups if the bot is in the channel', async function () {
      this.bot.slack.chan.name_to_obj.slack = {
        ...TEST_CHANNEL, is_member: undefined, is_group: true
      };
      await this.bot.sendToSlack('testuser', '#irc', 'testmessage');
      this.postMessage.should.have.been.called;
    });

    it('should not include an avatar for the bot\'s own messages', async function () {
      await this.bot.sendToSlack(config.nickname, '#irc', 'testmessage');
      this.postMessage.firstCall.args[0].should.include({
        username: `${config.nickname} (IRC)`,
        icon_url: undefined
      });
    });

    it('should not include an avatar if avatarUrl is set to false', async function () {
      const bot = await createBot({ ...config, avatarUrl: false });
      await bot.sendToSlack('testuser', '#irc', 'testmessage');
      bot.slack.web.chat.postMessage.firstCall.args[0].should.include({
        icon_url: undefined
      });
    });

    it('should use a custom icon url if given', async function () {
      const bot = await createBot({ ...config, avatarUrl: 'https://cat.com' });
      await bot.sendToSlack('testuser', '#irc', 'testmessage');
      bot.slack.web.chat.postMessage.firstCall.args[0].should.include({
        icon_url: 'https://cat.com'
      });
    });

    it('should replace $username in the given avatarUrl', async function () {
      const bot = await createBot({
        ...config, avatarUrl: 'https://robohash.org/$username.png'
      });
      await bot.sendToSlack('testuser', '#irc', 'testmessage');
      bot.slack.web.chat.postMessage.firstCall.args[0].should.include({
        icon_url: 'https://robohash.org/testuser.png'
      });
    });

    it('should allow disabling the Slack username suffix', async function () {
      const bot = await createBot({ ...config, slackUsernameFormat: '$username' });
      await bot.sendToSlack('testuser', '#irc', 'textmessage');
      bot.slack.web.chat.postMessage.firstCall.args[0].should.include({
        username: 'testuser'
      });
    });

    it('should replace $username in a custom Slack username format', async function () {
      const bot = await createBot({
        ...config, slackUsernameFormat: 'prefix $username suffix'
      });
      await bot.sendToSlack('testuser', '#irc', 'textmessage');
      bot.slack.web.chat.postMessage.firstCall.args[0].should.include({
        username: 'prefix testuser suffix'
      });
    });

    it('should replace a bare username if the user is in-channel', async function () {
      await this.bot.sendToSlack('testuser', '#irc', 'testuser should be replaced');
      this.postMessage.firstCall.args[0].should.include({
        text: '@testuser should be replaced'
      });
    });

    it('should not send messages to slack if the channel isn\'t mapped', async function () {
      await this.bot.sendToSlack('user', '#wrongchan', 'message');
      this.postMessage.should.not.have.been.called;
    });

    it('should not send messages to slack if the bot isn\'t in the channel', async function () {
      this.bot.slack.chan.name_to_obj = {};
      await this.bot.sendToSlack('user', '#irc', 'message');
      this.postMessage.should.not.have.been.called;
    });

    it('should not send messages to slack if is_member is false', async function () {
      this.bot.slack.chan.name_to_obj.slack = { ...TEST_CHANNEL, is_member: false };
      await this.bot.sendToSlack('user', '#irc', 'message');
      this.postMessage.should.not.have.been.called;
    });

    it('should not forward messages from users in the irc mute list', async function () {
      this.bot.muteUsers.irc = ['testuser'];
      await this.bot.sendToSlack('testuser', '#irc', 'testmessage');
      this.postMessage.should.not.have.been.called;
    });
  });

  describe('messages with no displayable text', function () {
    it('should not post a message that is only a Ctrl+S', async function () {
      await this.bot.sendToSlack('testuser', '#irc', CTRL_S);
      this.postMessage.should.not.have.been.called;
    });

    it('should not post a message that is only IRC formatting', async function () {
      await this.bot.sendToSlack('testuser', '#irc', `${BOLD}${UNDERLINE}${COLOUR}4${RESET}`);
      this.postMessage.should.not.have.been.called;
    });

    it('should not post a whitespace-only message', async function () {
      await this.bot.sendToSlack('testuser', '#irc', '   ');
      this.postMessage.should.not.have.been.called;
    });

    it('should strip IRC formatting before sending to slack', async function () {
      await this.bot.sendToSlack('testuser', '#irc', `${BOLD}bold${BOLD} and ${COLOUR}4red${RESET}`);
      this.postMessage.firstCall.args[0].should.include({ text: 'bold and red' });
    });

    it('should strip a Ctrl+S from otherwise normal text', async function () {
      await this.bot.sendToSlack('testuser', '#irc', `hel${CTRL_S}lo`);
      this.postMessage.firstCall.args[0].should.include({ text: 'hello' });
    });
  });

  describe('Slack API failures', function () {
    it('should not reject when slack refuses the message', async function () {
      this.postMessage.rejects(new Error('An API error occurred: no_text'));
      // Resolving at all is the assertion: an unhandled rejection here would
      // take the whole bridge down.
      await this.bot.sendToSlack('testuser', '#irc', 'testmessage');
      this.logs.error.should.have.been.called;
    });

    it('should not reject when the member lookup fails', async function () {
      this.bot.slack.web.conversations.members
        .rejects(new Error('An API error occurred: ratelimited'));
      await this.bot.sendToSlack('testuser', '#irc', 'testmessage');
      this.logs.error.should.have.been.called;
    });
  });

  describe('Slack to IRC', function () {
    it('should send correct messages to irc', function () {
      this.bot.sendToIRC(slackMessage({ text: 'testmessage' }));
      this.say.should.have.been.calledWith('#irc', '<testuser> testmessage');
    });

    it('should allow custom user formats for irc', async function () {
      const bot = await createBot({ ...config, ircUsernameFormat: '$username: ' });
      bot.sendToIRC(slackMessage({ text: 'testmessage' }));
      bot.ircClient.say.should.have.been.calledWith('#irc', 'testuser: testmessage');
    });

    it('should allow removing the user name for irc', async function () {
      const bot = await createBot({ ...config, ircUsernameFormat: '' });
      bot.sendToIRC(slackMessage({ text: 'testmessage' }));
      bot.ircClient.say.should.have.been.calledWith('#irc', 'testmessage');
    });

    it('should send /me messages to irc', function () {
      this.bot.sendToIRC(slackMessage({ text: 'testmessage', subtype: 'me_message' }));
      this.say.should.have.been.calledWith('#irc', 'Action: testuser testmessage');
    });

    it('should send files to irc', function () {
      this.bot.sendToIRC(slackMessage({
        text: '',
        subtype: 'file_share',
        file: {
          permalink: 'test1',
          permalink_public: 'test2',
          initial_comment: { comment: 'testcomment' }
        }
      }));
      this.say.should.have.been.calledWith(
        '#irc', '<testuser> File uploaded test1 / test2 - testcomment'
      );
    });

    it('should not send messages to irc if the channel isn\'t mapped', function () {
      this.bot.sendToIRC(slackMessage({ channel: 'CWRONGID', text: 'hi' }));
      this.say.should.not.have.been.called;
    });

    it('should send messages from slackbot if slackbot muting is off', function () {
      this.bot.sendToIRC(slackMessage({ text: 'A message from Slackbot' }));
      this.say.should.have.been.calledWith('#irc', '<testuser> A message from Slackbot');
    });

    it('should not send messages from slackbot to irc if muting is on', function () {
      this.bot.muteSlackbot = true;
      this.bot.sendToIRC(slackMessage({ text: 'hi', user: 'USLACKBOT' }));
      this.say.should.not.have.been.called;
    });

    it('should hide usernames for commands', function () {
      this.bot.sendToIRC(slackMessage({ text: '!test command' }));
      this.say.getCall(0).args.should.deep.equal([
        '#irc', 'Command sent from Slack by testuser:'
      ]);
      this.say.getCall(1).args.should.deep.equal(['#irc', '!test command']);
    });

    it('should not forward messages from users in the slack mute list', function () {
      this.bot.muteUsers.slack = ['testuser'];
      this.bot.sendToIRC(slackMessage({ text: 'testmessage' }));
      this.say.should.not.have.been.called;
    });

    it('should parse text from slack when sending messages', function () {
      this.bot.sendToIRC(slackMessage({ text: '<@USOMEID> <@USOMEID|readable>' }));
      this.say.should.have.been.calledWith('#irc', '<testuser> @testuser readable');
    });
  });

  describe('parseText', function () {
    it('should parse text from slack', function () {
      this.bot.parseText('hi\nhi\r\nhi\r').should.equal('hi hi hi ');
      this.bot.parseText('>><<').should.equal('>><<');
      this.bot.parseText('<!channel> <!group> <!everyone>')
        .should.equal('@channel @group @everyone');
      this.bot.parseText('<#CSOMEID> <#CSOMEID|readable>')
        .should.equal('#slack readable');
      this.bot.parseText('<@USOMEID> <@USOMEID|readable>')
        .should.equal('@testuser readable');
      this.bot.parseText('<https://example.com>').should.equal('https://example.com');
      this.bot.parseText('<https://example.com> <https://ap.no>')
        .should.equal('https://example.com https://ap.no');
      this.bot.parseText('<https://example.com|example.com> <https://ap.no|ap.no>')
        .should.equal('example.com ap.no');
      this.bot.parseText('<!somecommand> <!somecommand|readable>')
        .should.equal('<somecommand> <readable>');
    });

    it('should handle entity-encoded messages from slack', function () {
      this.bot.parseText('&amp;lt;&amp;gt;').should.equal('&lt;&gt;');
      this.bot.parseText('&lt;@UNONEID&gt;').should.equal('<@UNONEID>');
      this.bot.parseText('&lt;#CNONEID&gt;').should.equal('<#CNONEID>');
      this.bot.parseText('&lt;!channel&gt;').should.equal('<!channel>');
      this.bot.parseText('&lt;<http://example.com|example.com>&gt;').should.equal('<example.com>');
      this.bot.parseText('java.util.List&lt;java.lang.String&gt;')
        .should.equal('java.util.List<java.lang.String>');
    });

    it('should parse emojis correctly', function () {
      this.bot.parseText(':smile:').should.equal(':)');
      this.bot.parseText(':train:').should.equal(':train:');
    });
  });
});
