import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

export function registerMockCommand(program) {
  const mock = program
    .command('mock')
    .description('Manage the local MockServer environment');

  mock
    .command('up')
    .description('Start MockServer, webhook services, and Swagger UI via docker compose')
    .option('-d, --detach', 'Run in background (detached mode)', true)
    .option('--no-swagger', 'Skip starting the Swagger UI container')
    .action((opts) => {
      const services = opts.swagger === false
        ? 'mockserver mockserver-init webhook-receiver webhook-playground'
        : '';
      const detachFlag = opts.detach ? '-d' : '';

      console.log('Starting Hii Retail DevKit services...');
      try {
        execSync(
          `docker compose up ${detachFlag} --build ${services}`.trim(),
          { cwd: PROJECT_ROOT, stdio: 'inherit' },
        );
        if (opts.detach) {
          console.log('\nServices started:');
          console.log('  MockServer:           http://localhost:1080');
          console.log('  Webhook Playground:   http://localhost:8081');
          console.log('  Webhook Receiver:     http://localhost:3002');
          if (opts.swagger !== false) {
            console.log('  Swagger UI:           http://localhost:8080');
          }
          console.log('\nHealth check:  curl http://localhost:1080/health');
          console.log('Send events:   devkit webhook events');
          console.log('View logs:     devkit webhook logs');
          console.log('Stop with:     devkit mock down');
        }
      } catch (err) {
        process.exit(err.status || 1);
      }
    });

  mock
    .command('down')
    .description('Stop and remove all DevKit containers')
    .option('-v, --volumes', 'Also remove volumes')
    .action((opts) => {
      const volumeFlag = opts.volumes ? '-v' : '';
      console.log('Stopping Hii Retail DevKit services...');
      try {
        execSync(
          `docker compose down ${volumeFlag}`.trim(),
          { cwd: PROJECT_ROOT, stdio: 'inherit' },
        );
      } catch (err) {
        process.exit(err.status || 1);
      }
    });

  mock
    .command('status')
    .description('Show status of DevKit containers')
    .action(() => {
      try {
        execSync('docker compose ps', { cwd: PROJECT_ROOT, stdio: 'inherit' });
      } catch (err) {
        process.exit(err.status || 1);
      }
    });

  mock
    .command('logs')
    .description('Show logs from DevKit containers')
    .option('-f, --follow', 'Follow log output')
    .option('--service <name>', 'Show logs for a specific service')
    .action((opts) => {
      const followFlag = opts.follow ? '-f' : '';
      const service = opts.service || '';
      try {
        execSync(
          `docker compose logs ${followFlag} ${service}`.trim(),
          { cwd: PROJECT_ROOT, stdio: 'inherit' },
        );
      } catch (err) {
        process.exit(err.status || 1);
      }
    });
}
