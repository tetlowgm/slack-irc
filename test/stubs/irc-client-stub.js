import { EventEmitter } from 'events';
import sinon from 'sinon';

/**
 * Stands in for the irc-upd Client. Bot calls say/send/join on it; tests assert
 * on those and drive the bridge by emitting IRC events.
 */
export default class ClientStub extends EventEmitter {
  constructor(nick) {
    super();
    // The real client keeps its current nick and a per-channel member list
    // (nick -> prefix characters) here; the kick easter egg reads both.
    this.nick = nick;
    this.chans = {};
    this.say = sinon.stub();
    this.send = sinon.stub();
    this.join = sinon.stub();
  }

  /** Puts the bot in `channel` with the given prefix, e.g. '@' for op. */
  giveModes(channel, modes) {
    const key = channel.toLowerCase();
    this.chans[key] = this.chans[key] || { key, users: {} };
    this.chans[key].users[this.nick] = modes;
    return this.chans[key];
  }
}
