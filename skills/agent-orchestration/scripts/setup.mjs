#!/usr/bin/env node
import { main } from './configure.mjs';

process.exitCode = await main(['setup', ...process.argv.slice(2)]);
