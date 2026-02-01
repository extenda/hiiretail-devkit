import { readFileSync } from 'fs';
import chalk from 'chalk';
import deepDiff from 'deep-diff';
const { diff } = deepDiff;
import { fetchCompleteItem } from '../lib/api-client.js';

export function registerVerifyCommand(program) {
  program
    .command('verify')
    .description('Verify a complete item view matches expectations')
    .requiredOption('--item-id <id>', 'The item ID to look up')
    .option('--target <target>', 'Target environment: mock or sandbox', 'mock')
    .option('--expect <file>', 'JSON file with expected complete item (for diff comparison)')
    .action(async (opts) => {
      console.log(chalk.dim(`Fetching complete item "${opts.itemId}" from ${opts.target}...\n`));

      let result;
      try {
        result = await fetchCompleteItem(opts.itemId, opts.target);
      } catch (err) {
        console.error(chalk.red(`Failed to fetch complete item: ${err.message}`));
        if (opts.target === 'mock') {
          console.error(chalk.dim('Is the mock environment running? Try: devkit mock up'));
        }
        process.exit(1);
      }

      if (!result.ok) {
        console.error(chalk.red(`Item not found (${result.status})`));
        if (result.body?.message) console.error(chalk.dim(result.body.message));
        process.exit(1);
      }

      const actual = result.body;

      // If no --expect file, just print the complete item
      if (!opts.expect) {
        console.log(chalk.green('✓ Complete item retrieved:\n'));
        console.log(JSON.stringify(actual, null, 2));
        return;
      }

      // Load expected and diff
      let expected;
      try {
        const raw = readFileSync(opts.expect, 'utf-8');
        expected = JSON.parse(raw);
      } catch (err) {
        console.error(chalk.red(`Cannot read expectations file: ${opts.expect}`));
        console.error(err.message);
        process.exit(1);
      }

      const differences = diff(expected, actual);

      if (!differences) {
        console.log(chalk.green('✓ Complete item matches expectations exactly.'));
        return;
      }

      // Filter out server-set fields that are expected to differ (at any depth)
      const ignoredFields = new Set(['created', 'modified', 'version', 'revision']);
      const meaningful = differences.filter(d => {
        const lastField = d.path?.[d.path.length - 1];
        return !ignoredFields.has(lastField);
      });

      if (meaningful.length === 0) {
        console.log(chalk.green('✓ Complete item matches expectations (ignoring server-set timestamps/versions).'));
        return;
      }

      console.log(chalk.red(`✗ Found ${meaningful.length} difference(s):\n`));

      for (const d of meaningful) {
        const path = (d.path || []).join('.');

        switch (d.kind) {
          case 'N':
            console.log(chalk.yellow(`  + ${path || '(root)'}: ${formatValue(d.rhs)} (unexpected field)`));
            break;
          case 'D':
            console.log(chalk.red(`  - ${path || '(root)'}: ${formatValue(d.lhs)} (missing field)`));
            break;
          case 'E':
            console.log(chalk.red(`  ~ ${path}: expected ${formatValue(d.lhs)} → got ${formatValue(d.rhs)}`));
            break;
          case 'A':
            console.log(chalk.red(`  ~ ${path}[${d.index}]: array difference`));
            break;
        }
      }

      console.log(chalk.dim('\nActual response:'));
      console.log(JSON.stringify(actual, null, 2));
      process.exit(1);
    });
}

function formatValue(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `"${v}"`;
  return JSON.stringify(v);
}
