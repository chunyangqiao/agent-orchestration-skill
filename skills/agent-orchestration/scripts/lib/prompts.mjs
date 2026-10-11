import { input, select, checkbox, confirm } from '../vendor/inquirer.mjs';
import { ConfigError } from './config.mjs';

export class SetupCancelled extends Error {
  constructor() {
    super('Setup cancelled');
    this.name = 'SetupCancelled';
  }
}

export function terminalPrompter(stdin = process.stdin, stdout = process.stdout) {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new ConfigError(
      'setup requires an interactive terminal. Agents collect choices in conversation, then use bootstrap without --apply to preview and with --apply to install and check.',
    );
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const onKey = (_, key) => {
    if (key?.name === 'escape' || (key?.ctrl && key.name === 'd')) cancel();
  };
  stdin.on('keypress', onKey);
  stdin.on('end', cancel);
  const context = { input: stdin, output: stdout, signal: controller.signal };
  async function prompt(fn, options) {
    try {
      if (controller.signal.aborted) throw new SetupCancelled();
      const value = await fn(options, context);
      if (typeof value === 'string' && value.trim().toLowerCase() === 'cancel')
        throw new SetupCancelled();
      return value;
    } catch (error) {
      if (['ExitPromptError', 'AbortPromptError'].includes(error.name)) throw new SetupCancelled();
      throw error;
    }
  }
  return {
    write: (text) => stdout.write(`${text}\n`),
    close() {
      cancel();
      stdin.off('keypress', onKey);
      stdin.off('end', cancel);
    },
    ask: (message, fallback, validate) =>
      prompt(input, {
        message,
        default: fallback,
        validate: (value) =>
          value.trim().toLowerCase() === 'cancel' || (validate?.(value.trim()) ?? true),
      }).then((value) => value.trim()),
    choice: (message, items, fallback = 1) =>
      prompt(select, {
        message,
        choices: items.map((name, value) => ({ name, value })),
        default: fallback - 1,
      }),
    roles: (message, names, fallback = 'all') =>
      prompt(checkbox, {
        message,
        choices: names.map((name) => ({ name, value: name, checked: fallback === 'all' })),
        required: false,
      }),
    confirm: (message) => prompt(confirm, { message, default: false }),
  };
}
