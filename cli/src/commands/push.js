import { readFileSync } from 'fs';
import chalk from 'chalk';
import { validate, API_SPEC_MAP } from '../lib/validator.js';
import { push } from '../lib/api-client.js';

export function registerPushCommand(program) {
  program
    .command('push')
    .description('Push a JSON payload to MockServer or Hii Retail sandbox')
    .requiredOption('--api <api>', `API to push to (${Object.keys(API_SPEC_MAP).join(', ')})`)
    .requiredOption('--file <file>', 'Path to JSON payload file')
    .option('--target <target>', 'Target environment: mock or sandbox', 'mock')
    .option('--skip-validation', 'Skip local schema validation before pushing')
    .action(async (opts) => {
      let raw;
      try {
        raw = readFileSync(opts.file, 'utf-8');
      } catch (err) {
        console.error(chalk.red(`Cannot read file: ${opts.file}`));
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

      // Validate first (unless skipped)
      if (!opts.skipValidation) {
        console.log(chalk.dim('Validating payload against OpenAPI spec...'));
        const payloads = Array.isArray(payload) ? payload : [payload];
        for (let i = 0; i < payloads.length; i++) {
          try {
            const result = await validate(payloads[i], opts.api);
            if (!result.valid) {
              const label = payloads.length > 1 ? ` [${i}]` : '';
              console.error(chalk.red(`✗ Validation failed for payload${label}:\n`));
              for (const err of result.errors) {
                console.error(chalk.red(`  ● ${err.message}`));
                if (err.suggestion) console.error(chalk.yellow(`    → ${err.suggestion}`));
              }
              console.error(chalk.dim('\nUse --skip-validation to bypass schema checks.'));
              process.exit(1);
            }
          } catch (err) {
            console.error(chalk.red(`✗ Validation error: ${err.message}`));
            console.error(chalk.dim('\nUse --skip-validation to bypass schema checks.'));
            process.exit(1);
          }
        }
        console.log(chalk.green('✓ Payload validated'));
      }

      // Push each payload
      const payloads = Array.isArray(payload) ? payload : [payload];
      let allOk = true;

      for (let i = 0; i < payloads.length; i++) {
        const label = payloads.length > 1 ? ` [${i}] (id: ${payloads[i].id || '?'})` : '';
        try {
          const result = await push(payloads[i], opts.api, opts.target);
          if (result.ok) {
            console.log(chalk.green(`✓ Pushed${label} → ${result.url} (${result.status})`));
          } else {
            allOk = false;
            console.error(chalk.red(`✗ Push failed${label} → ${result.url} (${result.status})`));
            console.error(chalk.dim(JSON.stringify(result.body, null, 2)));
          }
        } catch (err) {
          allOk = false;
          console.error(chalk.red(`✗ Push error${label}: ${err.message}`));
        }
      }

      if (!allOk) process.exit(1);
    });
}
