import sinon from 'sinon';
import { createBot, stubDependencies } from './stubs/setup.js';
import config from './fixtures/single-test-config.json' with { type: 'json' };

describe('Bot Events', function () {
  const sandbox = sinon.createSandbox();

  beforeEach(async function () {
    this.logs = stubDependencies(sandbox);
    this.bot = await createBot(config);
    this.bot.sendToIRC = sandbox.stub();
    this.bot.sendToSlack = sandbox.stub();
    // Re-attach so the listeners close over the stubs above.
    this.bot.ircClient.removeAllListeners();
    this.bot.attachListeners();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should try to send autoSendCommands on registered IRC event', function () {
    this.bot.ircClient.emit('registered');
    this.bot.ircClient.send.should.have.been.calledTwice;
    this.bot.ircClient.send.getCall(0).args.should.deep.equal(config.autoSendCommands[0]);
    this.bot.ircClient.send.getCall(1).args.should.deep.equal(config.autoSendCommands[1]);
  });

  it('should error log on IRC error events', function () {
    const ircError = new Error('irc');
    this.bot.ircClient.emit('error', ircError);
    this.logs.error.should.have.been.calledWith('Received error event from IRC', ircError);
  });

  it('should exit on irc abort events', function () {
    const exit = sandbox.stub(process, 'exit');
    this.bot.ircClient.emit('abort', 10);
    exit.should.have.been.calledWith(1);
  });

  describe('Slack messages', function () {
    it('should send messages to irc if correct', async function () {
      const message = { type: 'message', text: 'hi' };
      await this.bot.slack.app.deliver(message);
      this.bot.sendToIRC.should.have.been.calledWithExactly(message);
    });

    it('should send files to irc if correct', async function () {
      const message = {
        type: 'message',
        subtype: 'file_share',
        file: { permalink: 'test', permalink_public: 'test' }
      };
      await this.bot.slack.app.deliver(message);
      this.bot.sendToIRC.should.have.been.calledWithExactly(message);
    });

    it('should not send messages to irc if the type isn\'t message', async function () {
      await this.bot.slack.app.deliver({ type: 'notmessage' });
      this.bot.sendToIRC.should.not.have.been.called;
    });

    it('should not send messages to irc if it has an invalid subtype', async function () {
      await this.bot.slack.app.deliver({ type: 'message', subtype: 'bot_message' });
      this.bot.sendToIRC.should.not.have.been.called;
    });
  });

  describe('IRC messages', function () {
    it('should send messages to slack', function () {
      this.bot.ircClient.emit('message', 'user', '#channel', 'hi');
      this.bot.sendToSlack.should.have.been.calledWithExactly('user', '#channel', 'hi');
    });

    it('should send notices to slack', function () {
      this.bot.ircClient.emit('notice', 'user', '#channel', 'hi');
      this.bot.sendToSlack.should.have.been.calledWithExactly('user', '#channel', '*hi*');
    });

    it('should send actions to slack', function () {
      this.bot.ircClient.emit('action', 'user', '#channel', 'hi', {});
      this.bot.sendToSlack.should.have.been.calledWithExactly('user', '#channel', '_hi_');
    });
  });

  describe('invites', function () {
    it('should join channels when invited', function () {
      this.bot.ircClient.emit('invite', '#irc', 'user');
      this.bot.ircClient.join.should.have.been.calledWith('#irc');
      this.logs.debug.should.have.been.calledWith('Joining channel:', '#irc');
    });

    it('should not join channels that aren\'t in the channel mapping', function () {
      this.bot.ircClient.emit('invite', '#wrong', 'user');
      this.bot.ircClient.join.should.not.have.been.called;
      this.logs.debug.should.have.been.calledWith(
        'Channel not found in config, not joining:', '#wrong'
      );
    });
  });
});
