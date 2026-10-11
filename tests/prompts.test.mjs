import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import {
  terminalPrompter,
  SetupCancelled,
} from '../skills/agent-orchestration/scripts/lib/prompts.mjs';

// Node readline intentionally disables editing for TERM=dumb (common in CI).
const originalTerm = process.env.TERM;
before(() => {
  process.env.TERM = 'xterm-256color';
});
after(() => {
  if (originalTerm === undefined) delete process.env.TERM;
  else process.env.TERM = originalTerm;
});

function terminal(t) {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  let screen = '';
  output.on('data', (data) => {
    screen += data.toString();
  });
  const io = terminalPrompter(input, output);
  t.after(() => {
    io.close();
    input.destroy();
    output.destroy();
  });
  return { io, input, screen: () => screen };
}

test('Inquirer supports arrow selection and Space multi-selection', async (t) => {
  const { io, input } = terminal(t);
  const choice = io.choice('Host', ['Codex', 'Claude', 'Kimi']);
  input.write('\x1b[B\r');
  assert.equal(await choice, 1);
  const roles = io.roles('Roles', ['explorer', 'reviewer']);
  input.write(' \r');
  assert.deepEqual(await roles, ['reviewer']);
  const empty = io.roles('Roles to adjust', ['explorer', 'reviewer'], 'none');
  input.write('\r');
  assert.deepEqual(await empty, []);
});

test('confirmation defaults to no and requires affirmative input', async (t) => {
  const { io, input } = terminal(t);
  const declined = io.confirm('Save?');
  input.write('\r');
  assert.equal(await declined, false);
  const approved = io.confirm('Save?');
  input.write('y\r');
  assert.equal(await approved, true);
});

test('input shows validation feedback and retries; Enter accepts a default', async (t) => {
  const { io, input, screen } = terminal(t);
  const answer = io.ask('Count', '3', (value) => Number(value) > 0 || 'Enter a positive integer.');
  input.write('0\r');
  await setImmediate();
  assert.match(screen(), /Enter a positive integer/);
  input.write('\b2\r');
  assert.equal(await answer, '2');
  const fallback = io.ask('Count', '3');
  input.write('\r');
  assert.equal(await fallback, '3');
});

for (const key of ['\x03', '\x04', '\x1b']) {
  test(`selection cancellation ${JSON.stringify(key)} cleans up without a stack trace`, async (t) => {
    const { io, input } = terminal(t);
    const pending = io.choice('Host', ['Codex', 'Claude']);
    input.write(key);
    await assert.rejects(pending, SetupCancelled);
    io.close();
    assert.equal(input.listenerCount('keypress'), 0);
    assert.equal(input.listenerCount('end'), 0);
  });
}

test('EOF and cancel text cancel input', async (t) => {
  const text = terminal(t);
  const first = text.io.ask('Path');
  text.input.write('cancel\r');
  await assert.rejects(first, SetupCancelled);
  const eof = terminal(t);
  const second = eof.io.ask('Path');
  eof.input.end();
  await assert.rejects(second, SetupCancelled);
});
