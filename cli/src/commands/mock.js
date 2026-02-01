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
    .description('Start MockServer, state server, and Swagger UI via docker compose')
    .option('-d, --detach', 'Run in background (detached mode)', true)
    .option('--no-swagger', 'Skip starting the Swagger UI container')
    .action((opts) => {
      const services = opts.swagger === false
        ? 'mockserver state-server mockserver-init'
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
          console.log('  MockServer:  http://localhost:1080');
          console.log('  State Server: http://localhost:3001');
          if (opts.swagger !== false) {
            console.log('  Swagger UI:  http://localhost:8080');
          }
          console.log('\nHealth check:  curl http://localhost:1080/health');
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
    .command('reset')
    .description('Clear all data in the state server (keeps containers running)')
    .action(async () => {
      try {
        const res = await fetch('http://localhost:3001/api/v1/_reset', { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        console.log('State server cleared — all items, prices, and identifiers removed.');
      } catch (err) {
        console.error(`Failed to reset state server: ${err.message}`);
        console.error('Is the mock environment running? Try: devkit mock up');
        process.exit(1);
      }
    });
}
