import { readFileSync } from 'fs';
import chalk from 'chalk';
import { validate, API_SPEC_MAP } from '../lib/validator.js';

export function registerValidateCommand(program) {
  program
    .command('validate <payload>')
    .description('Validate a JSON payload against a Hii Retail OpenAPI schema')
    .requiredOption('--api <api>', `API to validate against (${Object.keys(API_SPEC_MAP).join(', ')})`)
    .action(async (payloadPath, opts) => {
      let raw;
      try {
        raw = readFileSync(payloadPath, 'utf-8');
      } catch (err) {
        console.error(chalk.red(`Cannot read file: ${payloadPath}`));
        console.error(err.message);
        process.exit(1);
      }

      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (err) {
        console.error(chalk.red('Invalid JSON:'));
        console.error(err.message);
        process.exit(1);
      }

      // Support validating arrays of payloads
      const payloads = Array.isArray(payload) ? payload : [payload];
      let allValid = true;

      console.log(chalk.dim('Fetching OpenAPI spec...'));

      for (let i = 0; i < payloads.length; i++) {
        const label = payloads.length > 1 ? ` [${i}]` : '';
        try {
          const result = await validate(payloads[i], opts.api);

          if (result.valid) {
            console.log(chalk.green(`✓ Payload${label} is valid against ${opts.api} schema`));
          } else {
            allValid = false;
            console.log(chalk.red(`✗ Payload${label} has ${result.errors.length} validation error(s):\n`));

            for (const err of result.errors) {
              console.log(chalk.red(`  ● ${err.message}`));
              if (err.path !== '(root)') {
                console.log(chalk.dim(`    at: ${err.path}`));
              }
              if (err.suggestion) {
                console.log(chalk.yellow(`    → ${err.suggestion}`));
              }
              console.log();
            }
          }
        } catch (err) {
          console.error(chalk.red(`Failed to validate: ${err.message}`));
          process.exit(1);
        }
      }

      if (!allValid) process.exit(1);
    });
}
