import sinon from 'sinon';

export const TEST_CHANNEL = {
  id: 'CSOMEID',
  name: 'slack',
  is_channel: true,
  is_member: true
};

export const TEST_USER = {
  id: 'USOMEID',
  name: 'testuser'
};

/**
 * Stands in for the @slack/bolt App that Bot#createSlackApp would otherwise build.
 * Constructing a real one opens a socket and calls auth.test, so every test
 * substitutes this instead.
 */
export default class SlackAppStub {
  constructor({ channels = [TEST_CHANNEL], users = [TEST_USER] } = {}) {
    // Bolt exposes the web client as `app.client`.
    this.client = {
      chat: {
        postMessage: sinon.stub().resolves({ ok: true })
      },
      conversations: {
        list: sinon.stub().resolves({ channels }),
        members: sinon.stub().resolves({ members: users.map(u => u.id) })
      },
      users: {
        list: sinon.stub().resolves({ members: users })
      }
    };

    this.start = sinon.stub().resolves();
    // Bot registers its Slack->IRC handler with app.message(''); capture it so
    // tests can invoke it the way Bolt would.
    this.messageHandler = null;
    this.message = sinon.stub().callsFake((pattern, handler) => {
      this.messageHandler = handler;
    });
  }

  /** Deliver a message the way Bolt would. */
  async deliver(message) {
    if (!this.messageHandler) throw new Error('no message handler registered');
    return this.messageHandler({ message, say: sinon.stub() });
  }
}
