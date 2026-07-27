import sinon from 'sinon';
import { Bot, stubDependencies } from './stubs/setup.js';
import index from '../lib/index.js';
import { createBots } from '../lib/helpers.js';
import testConfig from './fixtures/test-config.json' with { type: 'json' };
import singleTestConfig from './fixtures/single-test-config.json' with { type: 'json' };
import badConfig from './fixtures/bad-config.json' with { type: 'json' };
import stringConfig from './fixtures/string-config.json' with { type: 'json' };

describe('Create Bots', function () {
  const sandbox = sinon.createSandbox();

  beforeEach(function () {
    stubDependencies(sandbox);
    this.connectStub = sandbox.stub(Bot.prototype, 'connect');
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should work when given an array of configs', function () {
    const bots = createBots(testConfig);
    bots.length.should.equal(2);
    this.connectStub.should.have.been.calledTwice;
  });

  it('should work when given an object as a config file', function () {
    const bots = createBots(singleTestConfig);
    bots.length.should.equal(1);
    this.connectStub.should.have.been.calledOnce;
  });

  it('should throw a configuration error if any fields are missing', function () {
    const wrap = () => createBots(badConfig);
    (wrap).should.throw('Missing configuration field nickname');
  });

  it('should throw if a configuration file is neither an object or an array', function () {
    const wrap = () => createBots(stringConfig);
    (wrap).should.throw('Invalid configuration file given');
  });

  it('should be possible to run it through the package entry point', function () {
    const bots = index(singleTestConfig);
    bots.length.should.equal(1);
    this.connectStub.should.have.been.called;
  });
});
