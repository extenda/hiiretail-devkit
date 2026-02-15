import { readFileSync } from 'fs';
import chalk from 'chalk';
import {
  fetchKinds,
  validateCccPayload,
  pushCccConfig,
  getCccConfig,
  deleteCccConfig,
} from '../lib/ccc-client.js';

export function registerCccCommand(program) {
  const ccc = program
    .command('ccc')
    .description('Manage Customer Controlled Configuration (CCC) for reason codes and other kinds');

  // -----------------------------------------------------------------------
  // list - list available CCC kinds
  // -----------------------------------------------------------------------
  ccc
    .command('list')
    .description('List available CCC kinds')
    .action(async () => {
      try {
        const kinds = await fetchKinds();
        if (kinds.length === 0) {
          console.log('No CCC kinds available.');
          return;
        }
        console.log(chalk.bold(`Available CCC kinds (${kinds.length}):\n`));
        for (const kind of kinds) {
          console.log(`  ${chalk.cyan(kind.kind)}`);
          console.log(`    Category:    ${kind.category}`);
          console.log(`    Description: ${chalk.dim(kind.description)}`);
          console.log();
        }
      } catch (err) {
        console.error(chalk.red(`Failed to list CCC kinds: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // validate - validate a payload against a CCC schema
  // -----------------------------------------------------------------------
  ccc
    .command('validate')
    .description('Validate a payload against a CCC schema')
    .requiredOption('--kind <kind>', 'CCC kind (e.g., rco.reason-codes.v1)')
    .requiredOption('-f, --file <file>', 'Path to the JSON payload file')
    .action(async (opts) => {
      try {
        const content = readFileSync(opts.file, 'utf-8');
        const payload = JSON.parse(content);

        const result = await validateCccPayload(payload, opts.kind);

        if (result.valid) {
          console.log(chalk.green(`✓ Payload is valid for ${opts.kind}`));
        } else {
          console.log(chalk.red(`✗ Validation failed for ${opts.kind}\n`));
          for (const err of result.errors) {
            console.log(`  ${chalk.yellow(err.path)}: ${err.message}`);
            if (err.suggestion) {
              console.log(`    ${chalk.dim(err.suggestion)}`);
            }
          }
          process.exit(1);
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.error(chalk.red(`File not found: ${opts.file}`));
        } else if (err instanceof SyntaxError) {
          console.error(chalk.red(`Invalid JSON in ${opts.file}: ${err.message}`));
        } else {
          console.error(chalk.red(`Validation error: ${err.message}`));
        }
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // push - push a CCC config to the server
  // -----------------------------------------------------------------------
  ccc
    .command('push')
    .description('Push a CCC config to the mock server')
    .requiredOption('--kind <kind>', 'CCC kind (e.g., rco.reason-codes.v1)')
    .requiredOption('-f, --file <file>', 'Path to the JSON payload file')
    .option('--bu <businessUnitId>', 'Business unit ID (for BU-level config)')
    .option('--skip-validation', 'Skip schema validation before pushing')
    .action(async (opts) => {
      try {
        const content = readFileSync(opts.file, 'utf-8');
        const payload = JSON.parse(content);

        // Validate first unless skipped
        if (!opts.skipValidation) {
          const validation = await validateCccPayload(payload, opts.kind);
          if (!validation.valid) {
            console.log(chalk.red(`✗ Validation failed for ${opts.kind}\n`));
            for (const err of validation.errors) {
              console.log(`  ${chalk.yellow(err.path)}: ${err.message}`);
              if (err.suggestion) {
                console.log(`    ${chalk.dim(err.suggestion)}`);
              }
            }
            console.log(chalk.dim('\nUse --skip-validation to bypass schema validation.'));
            process.exit(1);
          }
        }

        // Push to server
        const result = await pushCccConfig(payload, opts.kind, { buId: opts.bu });

        if (result.ok) {
          const level = opts.bu ? `business unit ${opts.bu}` : 'tenant';
          console.log(chalk.green(`✓ Config pushed to ${level} (${result.status})`));
          console.log(`  Kind: ${chalk.cyan(opts.kind)}`);
          console.log(`  URL:  ${result.url}`);
        } else {
          console.error(chalk.red(`✗ Push failed (${result.status})`));
          if (result.body) {
            console.error(`  ${JSON.stringify(result.body, null, 2)}`);
          }
          process.exit(1);
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.error(chalk.red(`File not found: ${opts.file}`));
        } else if (err instanceof SyntaxError) {
          console.error(chalk.red(`Invalid JSON in ${opts.file}: ${err.message}`));
        } else {
          console.error(chalk.red(`Push error: ${err.message}`));
          console.error('Is the mock environment running? Try: devkit mock up');
        }
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // get - get a CCC config from the server
  // -----------------------------------------------------------------------
  ccc
    .command('get')
    .description('Get a CCC config from the mock server')
    .requiredOption('--kind <kind>', 'CCC kind (e.g., rco.reason-codes.v1)')
    .option('--bu <businessUnitId>', 'Business unit ID (for BU-level config)')
    .action(async (opts) => {
      try {
        const result = await getCccConfig(opts.kind, { buId: opts.bu });

        if (result.ok) {
          console.log(JSON.stringify(result.body, null, 2));
        } else {
          if (result.status === 404) {
            const level = opts.bu ? `business unit ${opts.bu}` : 'tenant';
            console.error(chalk.yellow(`No config found for ${opts.kind} at ${level} level`));
          } else {
            console.error(chalk.red(`✗ Get failed (${result.status})`));
            if (result.body) {
              console.error(`  ${JSON.stringify(result.body, null, 2)}`);
            }
          }
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(`Get error: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // delete - delete a CCC config from the server
  // -----------------------------------------------------------------------
  ccc
    .command('delete')
    .description('Delete a CCC config from the mock server')
    .requiredOption('--kind <kind>', 'CCC kind (e.g., rco.reason-codes.v1)')
    .option('--bu <businessUnitId>', 'Business unit ID (for BU-level config)')
    .action(async (opts) => {
      try {
        const result = await deleteCccConfig(opts.kind, { buId: opts.bu });

        if (result.ok) {
          const level = opts.bu ? `business unit ${opts.bu}` : 'tenant';
          console.log(chalk.green(`✓ Config deleted from ${level}`));
          console.log(`  Kind: ${chalk.cyan(opts.kind)}`);
        } else {
          if (result.status === 404) {
            const level = opts.bu ? `business unit ${opts.bu}` : 'tenant';
            console.error(chalk.yellow(`No config found for ${opts.kind} at ${level} level`));
          } else {
            console.error(chalk.red(`✗ Delete failed (${result.status})`));
            if (result.body) {
              console.error(`  ${JSON.stringify(result.body, null, 2)}`);
            }
          }
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(`Delete error: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });
}
