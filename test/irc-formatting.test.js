/* eslint-disable prefer-arrow-callback */
import { should } from 'chai';
import { stripIrcFormatting } from '../lib/helpers.js';

should();

// Built with fromCharCode on purpose: literal control characters in source are
// invisible and get mangled by editors and diffs.
const chr = code => String.fromCharCode(code);
const CTRL_S = chr(0x13);
const COLOUR = chr(0x03);
const HEX_COLOUR = chr(0x04);

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
    ['bold', chr(0x02)],
    ['italic', chr(0x1d)],
    ['underline', chr(0x1f)],
    ['reverse', chr(0x16)],
    ['monospace', chr(0x11)],
    ['strikethrough', chr(0x1e)],
    ['reset', chr(0x0f)]
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
      stripIrcFormatting(`a${chr(c)}b`).should.equal('ab');
    }
  });
});
