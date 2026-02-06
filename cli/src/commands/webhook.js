import chalk from 'chalk';
import { fetchEventSources, sendWebhook, fetchWebhookLogs, clearWebhookLogs } from '../lib/webhook-client.js';

export function registerWebhookCommand(program) {
  const webhook = program
    .command('webhook')
    .description('Send test webhook events and view received event logs');

  // -----------------------------------------------------------------------
  // events - list available event sources
  // -----------------------------------------------------------------------
  webhook
    .command('events')
    .description('List available event sources for testing')
    .action(async () => {
      try {
        const sources = await fetchEventSources();
        if (sources.length === 0) {
          console.log('No event sources available.');
          return;
        }
        console.log(chalk.bold(`Available event sources (${sources.length}):\n`));
        for (const source of sources) {
          console.log(`  ${chalk.cyan(source)}`);
        }
        console.log(chalk.dim('\nUse: devkit webhook send <event-source> --target <url>'));
      } catch (err) {
        console.error(chalk.red(`Failed to list event sources: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // send - send an event to a target URL
  // -----------------------------------------------------------------------
  webhook
    .command('send <event-source>')
    .description('Send a webhook event to a target URL')
    .option('--target <url>', 'Target URL to receive the webhook', 'http://webhook-receiver:3002/api/v1/webhook-events')
    .option('--username <user>', 'Basic auth username')
    .option('--password <pass>', 'Basic auth password')
    .option('-H, --header <header>', 'Custom header in "Name: Value" format (repeatable)', collectHeaders, {})
    .action(async (eventSource, opts) => {
      try {
        const auth = (opts.username && opts.password) ? {
          type: 'basic',
          username: opts.username,
          password: opts.password,
        } : null;

        const result = await sendWebhook(eventSource, opts.target, {
          auth,
          headers: Object.keys(opts.header).length > 0 ? opts.header : undefined,
        });

        if (result.success) {
          console.log(chalk.green(`Webhook sent successfully`));
          console.log(`  Status: ${result.status} ${result.statusText || ''}`);
          console.log(`  Event:  ${chalk.cyan(eventSource)}`);
          console.log(`  Target: ${opts.target}`);
          if (result.body) {
            console.log(`  Response: ${typeof result.body === 'string' ? result.body : JSON.stringify(result.body)}`);
          }
        } else {
          console.error(chalk.red(`Webhook delivery failed`));
          console.log(`  Status: ${result.status || 'N/A'} ${result.statusText || ''}`);
          console.log(`  Error:  ${result.error || 'Unknown error'}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(`Failed to send webhook: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // logs - show received webhook events
  // -----------------------------------------------------------------------
  webhook
    .command('logs')
    .description('Show webhook events received by the built-in receiver')
    .option('--type <type>', 'Filter by event type')
    .option('--limit <n>', 'Maximum number of events to show', '20')
    .option('--follow', 'Poll for new events every 2 seconds')
    .action(async (opts) => {
      try {
        const events = await fetchWebhookLogs({
          type: opts.type,
          limit: opts.limit,
        });

        if (!opts.follow) {
          if (events.length === 0) {
            console.log('No webhook events received yet.');
            console.log('Send test events: devkit webhook send <event-source>');
            console.log('Or use the Webhook Playground UI: http://localhost:8081');
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

  // -----------------------------------------------------------------------
  // clear - clear all received events
  // -----------------------------------------------------------------------
  webhook
    .command('clear')
    .description('Clear all received webhook events from the built-in receiver')
    .action(async () => {
      try {
        await clearWebhookLogs();
        console.log(chalk.green('Webhook event logs cleared.'));
      } catch (err) {
        console.error(chalk.red(`Failed to clear webhook logs: ${err.message}`));
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });
}

function collectHeaders(value, previous) {
  const [name, ...rest] = value.split(':');
  if (name && rest.length > 0) {
    previous[name.trim()] = rest.join(':').trim();
  }
  return previous;
}

function printEvents(events) {
  for (const evt of events) {
    const time = new Date(evt.timestamp).toLocaleTimeString();
    const type = chalk.cyan(evt.type || 'unknown');
    const id = chalk.dim(evt.id || '');
    console.log(`  ${time}  ${type}  ${id}`);
  }
}
