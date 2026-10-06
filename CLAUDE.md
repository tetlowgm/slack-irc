# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Orientation

This is a fork (`tetlowgm/slack-irc`) of `ekmartin/slack-irc`. The branch that matters is
**`easter-egg-kick-trouble`** — that is what runs in production. It builds on
`fix-for-slack-changes`, which is a substantial rewrite of `master`: `@slack/client` + RTM became
`@slack/bolt` in socket mode, Babel was dropped, and the package became native ES modules. Work
against `easter-egg-kick-trouble`, not `master`, unless you have a specific reason.

There is **no build step**. The package runs straight from `lib/`; `dist/` no longer exists.

## Commands

```bash
npm install
```

Run the bridge (note the extra `--`, so the flag reaches the script rather than npm):

```bash
npm start -- --config /path/to/config.json
```

Tests and lint:

```bash
npm test          # lint + coverage — this is the gate
npm run lint      # eslint only
npm run mocha     # tests only, no coverage
npm run coverage  # c8 + mocha
```

A single file, or a single test by name:

```bash
npx mocha test/bot.test.js --grep "should invert the channel mapping"
```

Config comes from `--config` or the `CONFIG_FILE` env var. A `.js` config is an ES module and must
`export default`; JSON configs may contain comments (`strip-json-comments`).

## Architecture

[lib/index.js](lib/index.js) exports `createBots` and runs the CLI only when it is the process
entry point. [lib/cli.js](lib/cli.js) resolves the config path, `import()`s it for `.js` or parses
it for JSON, and returns the constructed bots. It is `async`, so `index.js` catches to keep a bad
config a readable startup error rather than an unhandled rejection.

`createBots` in [lib/helpers.js](lib/helpers.js) takes one config object or an array, building a
`Bot` per entry — that is how one process bridges several Slack workspaces and IRC networks.

[lib/bot.js](lib/bot.js) is the whole bridge.

- The constructor enforces `REQUIRED_FIELDS` (`server`, `nickname`, `channelMapping`,
  `slack_bot_token`, `slack_signing_secret`, `slack_app_token`), builds the Bolt app via
  `createSlackApp`, strips channel keys out of the mapping, lowercases IRC channel names, and
  builds `invertedMapping`. Those two maps are the routing table in both directions.
- `connect()` is `async`. It starts the Bolt app, then **prefetches** `conversations.list` and
  `users.list` into `this.slack.chan` and `this.slack.user`. `saveRes` turns each list into four
  lookup maps: `id_to_name`, `id_to_obj`, `name_to_id`, `name_to_obj`. Every later ID→name lookup
  reads these caches — there is no live data store, so anything created in Slack after startup is
  invisible until restart.
- `attachListeners` wires Bolt `app.message('')` → `sendToIRC`, and IRC
  `message`/`notice`/`action`/`invite`/`join`/`part`/`quit` → `sendToSlack`. Invites are only
  accepted for channels already in the mapping.
- `parseText` converts Slack markup (`<@U…>`, `<#C…>`, `<!channel>`, links, HTML entities) and
  `:emoji:` (via `assets/emoji.json`) into plain IRC text. **The order of those `.replace` calls is
  load-bearing.**
- Going the other way, `stripIrcFormatting` ([lib/helpers.js](lib/helpers.js)) removes IRC colour
  and formatting codes plus stray control characters, and `sendToSlack` drops the message entirely
  if nothing displayable survives. This is not cosmetic: Slack strips control characters itself and
  then rejects the now-empty text with `no_text` — an unhandled rejection that used to kill the
  process. A lone Ctrl+S from IRC was enough to do it.
- Easter egg: on that same empty-text path, `kickTroublemaker` kicks the IRC nick `trouble` with
  "stop trying to crash me" when the message contained a Ctrl+S — but only if `canKick` finds the
  bot holding an op-ish prefix (`~&@%`) in `ircClient.chans[channel].users`. Never a ban, and it
  fires before the channel-mapping check, so it applies in unmapped channels too.
- `highlightUsername` re-prefixes bare IRC nicks with `@` for each current Slack channel member so
  notifications fire.
- Only the `me_message` and `file_share` subtypes cross from Slack to IRC; every other subtype is
  dropped.

Username and avatar presentation is entirely config-driven through `$username` placeholders
(`slackUsernameFormat`, `ircUsernameFormat`, `avatarUrl`); `avatarUrl: false` disables avatars.

## Tests

Mocha 11 + chai 5 (`should` style) + sinon 19 + sinon-chai 4, coverage via c8. Nothing touches the
network. Mocha's config lives in the `"mocha"` key of `package.json` — see the gotcha below.

The standard pattern is `stubDependencies(sandbox)` followed by `await createBot(config)`, both
from [test/stubs/setup.js](test/stubs/setup.js):

```js
const sandbox = sinon.createSandbox();
this.logs = stubDependencies(sandbox);   // stubs the Bolt app, the irc client, and the logger
this.bot = await createBot(config);
```

- **Never construct a `Bot` without `stubDependencies` first.** A real Bolt `App` opens a socket and
  fires `auth.test` on construction; with test tokens that rejects *unhandled* and takes the whole
  run down before a single assertion. `Bot#createSlackApp` exists purely so this is stubbable.
- [test/stubs/slack-stub.js](test/stubs/slack-stub.js) is the Bolt app: `client`
  (`chat`/`conversations`/`users`), `start`, and a `message()` that captures the handler. Call
  `bot.slack.app.deliver(message)` to feed in a Slack message the way Bolt would. It also exports
  `TEST_CHANNEL` and `TEST_USER` — messages must carry Slack **IDs**, not names, because the
  handlers index the prefetched caches.
- The logger is exported from `lib/bot.js` only so tests can stub it. Stubbing winston's
  module-level methods does nothing, because `lib/` builds its own logger with `createLogger`.
- Write control characters as `String.fromCharCode(0x13)`. Literal ones are invisible in source and
  get silently eaten in transit, which turns the Ctrl+S tests vacuous without any failure.

## Gotchas

- `.gitignore` contains `/*.json`, which swallows **every top-level JSON file**. A `.mocharc.json`
  would look fine locally and never be committed — that is why the mocha config lives in
  `package.json`. Same trap for any new root-level JSON. It also means `package-lock.json` is never
  committed, so a dependency bump only reaches the server via `npm install` after pulling.
- Bolt must stay on v4+. Bolt 3 pulls in `@slack/socket-mode` 1.x, whose `finity` state machine
  throws an uncatchable `Unhandled event 'server explicit disconnect' in state 'connecting'` when
  Slack sends a disconnect mid-handshake, killing the process.
- ESM rules bite: relative imports need the `.js` extension, and JSON imports need
  `with { type: 'json' }`. The `import/extensions` lint rule is there to catch the first one,
  because getting it wrong is a runtime `ERR_MODULE_NOT_FOUND`, not a style nit.
- **chai 5 has no default export.** Use `import { should, expect } from 'chai'`.
- Lint is eslint 9 flat config in [eslint.config.js](eslint.config.js). The old airbnb-base preset
  has no flat-config build, so the rules that earned their keep were carried over directly.
  `ecmaVersion` is `'latest'` so import attributes parse.
- `NODE_ENV=development` sets the log level on **`index.js`'s logger only**. `lib/bot.js` builds a
  separate logger that stays at `info`, so none of the bridge's `logger.debug` calls ever appear.
- `README.md` is stale for this branch: it still documents a single `"token"` field, Babel, and
  `npm run build`. Trust `REQUIRED_FIELDS` in [lib/bot.js](lib/bot.js) over the README.
- The default `avatarUrl` is `http://api.adorable.io/avatars/48/$username.png`, and that service is
  long dead. The README's example uses robohash instead.
