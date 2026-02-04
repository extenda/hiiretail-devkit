import chalk from 'chalk';
import { registerWebhook, listWebhooks, removeWebhook, fetchWebhookLogs } from '../lib/webhook-client.js';

export function registerWebhookCommand(program) {
  const webhook = program
    .command('webhook')
    .description('Manage webhook subscriptions and view event logs');

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------
  webhook
    .command('register <url>')
    .description('Register a new webhook subscription')
    .option('--events <types>', 'Comma-separated event types to subscribe to (default: all)', '')
    .option('--secret <secret>', 'HMAC-SHA256 signing secret')
    .action(async (url, opts) => {
      try {
        const events = opts.events ? opts.events.split(',').map(e => e.trim()) : undefined;
        const sub = await registerWebhook(url, { events, secret: opts.secret });
        console.log(chalk.green('Webhook registered:'));
        console.log(`  ID:     ${sub.id}`);
        console.log(`  URL:    ${sub.url}`);
        console.log(`  Events: ${sub.events.join(', ')}`);
        if (sub.secret) console.log(`  Secret: (set)`);
      } catch (err) {
        console.error(chalk.red(`Failed to register webhook: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------
  webhook
    .command('list')
    .description('List all webhook subscriptions')
    .action(async () => {
      try {
        const subs = await listWebhooks();
        if (subs.length === 0) {
          console.log('No webhook subscriptions.');
          return;
        }
        console.log(chalk.bold(`Webhook subscriptions (${subs.length}):\n`));
        for (const sub of subs) {
          const isDefault = sub.id === 'default' ? chalk.dim(' (built-in)') : '';
          console.log(`  ${chalk.cyan(sub.id)}${isDefault}`);
          console.log(`    URL:    ${sub.url}`);
          console.log(`    Events: ${sub.events.join(', ')}`);
          if (sub.secret) console.log(`    Secret: ***`);
          console.log();
        }
      } catch (err) {
        console.error(chalk.red(`Failed to list webhooks: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // remove
  // -----------------------------------------------------------------------
  webhook
    .command('remove <id>')
    .description('Remove a webhook subscription')
    .option('--force', 'Force removal (required for the default webhook)')
    .action(async (id, opts) => {
      try {
        const result = await removeWebhook(id, { force: opts.force });
        console.log(chalk.green(result.message));
      } catch (err) {
        console.error(chalk.red(`Failed to remove webhook: ${err.message}`));
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // logs
  // -----------------------------------------------------------------------
  webhook
    .command('logs')
    .description('Show received webhook events')
    .option('--type <type>', 'Filter by event type (e.g. item.created)')
    .option('--limit <n>', 'Maximum number of events to show', '20')
    .option('--follow', 'Poll for new events every 2 seconds')
    .action(async (opts) => {
      const fetchAndPrint = async (since) => {
        const events = await fetchWebhookLogs({
          type: opts.type,
          limit: opts.limit,
          since,
        });
        return events;
      };

      try {
        const events = await fetchAndPrint();

        if (!opts.follow) {
          if (events.length === 0) {
            console.log('No webhook events received yet.');
            console.log('Push a payload to trigger events: devkit push --api item --file <file> --target mock');
            return;
          }
          printEvents(events);
          return;
        }

        // Follow mode: print initial events, then poll
        if (events.length > 0) printEvents(events);
        let lastTimestamp = events.length > 0 ? events[0].timestamp : new Date().toISOString();

        console.log(chalk.dim('\nWatching for new events (Ctrl+C to stop)...\n'));

        const poll = async () => {
          try {
            const newEvents = await fetchWebhookLogs({
              type: opts.type,
              since: lastTimestamp,
            });
            // Filter out events we already printed (since is inclusive)
            const fresh = newEvents.filter(e => e.timestamp > lastTimestamp);
            if (fresh.length > 0) {
              printEvents(fresh);
              lastTimestamp = fresh[0].timestamp;
            }
          } catch {
            // Silently retry on transient errors in follow mode
          }
        };

        setInterval(poll, 2000);
      } catch (err) {
        console.error(chalk.red(`Failed to fetch webhook logs: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });
}

function printEvents(events) {
  for (const evt of events) {
    const time = new Date(evt.timestamp).toLocaleTimeString();
    const type = chalk.cyan(evt.type);
    const id = chalk.dim(evt.id);
    const entityId = evt.metadata?.entityId || '';
    console.log(`  ${time}  ${type}  ${entityId}  ${id}`);
  }
}
