import { should, expect } from 'chai';
import sinon from 'sinon';
import cli from '../lib/cli.js';
import { Bot, stubDependencies } from './stubs/setup.js';

should();

describe('CLI', function () {
  const sandbox = sinon.createSandbox();

  // cli() builds real Bots, so keep them off the network and away from connect().
  beforeEach(function () {
    stubDependencies(sandbox);
    sandbox.stub(Bot.prototype, 'connect');
  });

  afterEach(function () {
    sandbox.restore();
    delete process.env.CONFIG_FILE;
  });

  const nicknames = bots => bots.map(bot => bot.nickname);

  it('should be possible to give the config as an env var', async function () {
    process.env.CONFIG_FILE = `${process.cwd()}/test/fixtures/test-config.json`;
    process.argv = ['node', 'index.js'];
    nicknames(await cli()).should.deep.equal(['test', 'test2']);
  });

  it('should strip comments from JSON config', async function () {
    process.env.CONFIG_FILE = `${process.cwd()}/test/fixtures/test-config-comments.json`;
    process.argv = ['node', 'index.js'];
    nicknames(await cli()).should.deep.equal(['test', 'test2']);
  });

  it('should support JS configs', async function () {
    process.env.CONFIG_FILE = `${process.cwd()}/test/fixtures/test-javascript-config.js`;
    process.argv = ['node', 'index.js'];
    nicknames(await cli()).should.deep.equal(['test', 'test2']);
  });

  it('should throw a ConfigurationError for invalid JSON', async function () {
    process.env.CONFIG_FILE = `${process.cwd()}/test/fixtures/invalid-config.json`;
    process.argv = ['node', 'index.js'];

    let error;
    try {
      await cli();
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an('error');
    error.message.should.equal('The configuration file contains invalid JSON');
  });

  it('should be possible to give the config as an option', async function () {
    process.argv = [
      'node',
      'index.js',
      '--config',
      `${process.cwd()}/test/fixtures/single-test-config.json`
    ];
    nicknames(await cli()).should.deep.equal(['test']);
  });
});
