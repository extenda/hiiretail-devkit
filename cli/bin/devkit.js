#!/usr/bin/env node
import { program } from 'commander';
import { registerMockCommand } from '../src/commands/mock.js';
import { registerValidateCommand } from '../src/commands/validate.js';
import { registerPushCommand } from '../src/commands/push.js';
import { registerVerifyCommand } from '../src/commands/verify.js';

program
  .name('devkit')
  .description('Hii Retail ERP Integration DevKit CLI')
  .version('1.0.0');

registerMockCommand(program);
registerValidateCommand(program);
registerPushCommand(program);
registerVerifyCommand(program);

program.parse();
