import sinon from 'sinon';
import { Bot, stubDependencies } from './stubs/setup.js';
import { validateChannelMapping } from '../lib/validators.js';
import config from './fixtures/single-test-config.json' with { type: 'json' };
import caseConfig from './fixtures/case-sensitivity-config.json' with { type: 'json' };

describe('Channel Mapping', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    stubDependencies(sandbox);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should fail when not given proper JSON', () => {
    const wrap = () => validateChannelMapping('not json');
    (wrap).should.throw('Invalid channel mapping given');
  });

  it('should not fail if given a proper channel list as JSON', () => {
    const wrap = () => validateChannelMapping({ '#channel': '#otherchannel' });
    (wrap).should.not.throw();
  });

  it('should clear channel keys from the mapping', () => {
    const bot = new Bot(config);
    bot.channelMapping['#slack'].should.equal('#irc');
    bot.invertedMapping['#irc'].should.equal('#slack');
    bot.channels[0].should.equal('#irc channelKey');
  });

  it('should lowercase IRC channel names', () => {
    const bot = new Bot(caseConfig);
    bot.channelMapping['#slack'].should.equal('#irc');
    bot.channelMapping['#OtherSlack'].should.equal('#otherirc');
  });
});
