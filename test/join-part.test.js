/* eslint-disable prefer-arrow-callback, no-unused-expressions */
import _ from 'lodash';
import sinon from 'sinon';
import { createBot, stubDependencies } from './stubs/setup.js';
import config from './fixtures/single-test-config.json' with { type: 'json' };

describe('Join/Part/Quit Notices', function () {
  const sandbox = sinon.createSandbox();

  // attachListeners only wires up join/part/quit when the notices are enabled,
  // so each test builds a bot with the setting it needs and re-attaches.
  const connectWith = async (ircStatusNotices) => {
    const bot = await createBot({ ..._.cloneDeep(config), ircStatusNotices });
    bot.sendToSlack = sandbox.stub();
    bot.ircClient.removeAllListeners();
    bot.attachListeners();
    return bot;
  };

  beforeEach(function () {
    stubDependencies(sandbox);
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should send joins to slack if enabled', async function () {
    const bot = await connectWith({ join: true });
    bot.ircClient.emit('join', '#channel', 'nick', {});
    bot.sendToSlack.should.have.been.calledWithExactly(
      config.nickname, '#channel', '*nick* has joined the IRC channel'
    );
  });

  it('should not send joins to slack if disabled', async function () {
    const bot = await connectWith({ join: false });
    bot.ircClient.emit('join', '#channel', 'nick', {});
    bot.sendToSlack.should.not.have.been.called;
  });

  it('should not send a join notice for the bot itself', async function () {
    const bot = await connectWith({ join: true });
    bot.ircClient.emit('join', '#channel', config.nickname, {});
    bot.sendToSlack.should.not.have.been.called;
  });

  it('should send parts to slack if enabled', async function () {
    const bot = await connectWith({ leave: true });
    bot.ircClient.emit('part', '#channel', 'nick', {});
    bot.sendToSlack.should.have.been.calledWithExactly(
      config.nickname, '#channel', '*nick* has left the IRC channel'
    );
  });

  it('should not send parts to slack if disabled', async function () {
    const bot = await connectWith({ leave: false });
    bot.ircClient.emit('part', '#channel', 'nick', {});
    bot.sendToSlack.should.not.have.been.called;
  });

  it('should send quits to slack if enabled', async function () {
    const bot = await connectWith({ leave: true });
    const channels = ['#channel1', '#channel2'];
    bot.ircClient.emit('quit', 'nick', 'reason', channels, {});
    channels.forEach((channel) => {
      bot.sendToSlack.should.have.been.calledWithExactly(
        config.nickname, channel, '*nick* has quit the IRC channel'
      );
    });
  });

  it('should not send quits to slack if disabled', async function () {
    const bot = await connectWith({ leave: false });
    bot.ircClient.emit('quit', 'nick', 'reason', ['#channel1'], {});
    bot.sendToSlack.should.not.have.been.called;
  });
});
