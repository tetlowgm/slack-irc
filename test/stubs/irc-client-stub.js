import { EventEmitter } from 'events';
import sinon from 'sinon';

/**
 * Stands in for the irc-upd Client. Bot calls say/send/join on it; tests assert
 * on those and drive the bridge by emitting IRC events.
 */
export default class ClientStub extends EventEmitter {
  constructor() {
    super();
    this.say = sinon.stub();
    this.send = sinon.stub();
    this.join = sinon.stub();
  }
}
