/* eslint-disable prefer-arrow-callback */
import chai from 'chai';
import { stripIrcFormatting } from '../lib/helpers.js';

chai.should();

const CTRL_S = '';
const COLOUR = '';
const HEX_COLOUR = '';

describe('IRC Formatting Removal', () => {
  it('should leave plain text alone', () => {
    stripIrcFormatting('hello world').should.equal('hello world');
  });

  it('should remove a lone Ctrl+S', () => {
    stripIrcFormatting(CTRL_S).should.equal('');
  });

  it('should remove a Ctrl+S from within a message', () => {
    stripIrcFormatting(`hel${CTRL_S}lo`).should.equal('hello');
  });

  [
    ['bold', ''],
    ['italic', ''],
    ['underline', ''],
    ['reverse', ''],
    ['monospace', ''],
    ['strikethrough', ''],
    ['reset', ''],
  ].forEach(([name, code]) => {
    it(`should remove the ${name} toggle`, () => {
      stripIrcFormatting(`${code}hey${code}`).should.equal('hey');
    });
  });

  it('should remove a foreground colour code', () => {
    stripIrcFormatting(`${COLOUR}4red`).should.equal('red');
  });

  it('should remove a foreground and background colour code', () => {
    stripIrcFormatting(`${COLOUR}04,08warning`).should.equal('warning');
  });

  it('should remove a bare colour terminator', () => {
    stripIrcFormatting(`${COLOUR}plain`).should.equal('plain');
  });

  it('should remove a hex colour code', () => {
    stripIrcFormatting(`${HEX_COLOUR}FF0000red`).should.equal('red');
  });

  it('should not eat digits that are not part of a colour code', () => {
    stripIrcFormatting('meet at 1600').should.equal('meet at 1600');
  });

  it('should remove every control character in the C0 range', () => {
    for (let c = 0; c <= 0x1f; c += 1) {
      stripIrcFormatting(`a${String.fromCharCode(c)}b`).should.equal('ab');
    }
  });
});
