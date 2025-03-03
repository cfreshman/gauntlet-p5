import { spawn } from 'child_process';
import process from 'process';

const services = [
  {
    name: 'thinking-server',
    command: 'node',
    args: ['--no-deprecation', 'src/thinking-server.js'],
    delay: 0
  },
  {
    name: 'mcp-server',
    command: 'node',
    args: ['--no-deprecation', 'src/aipi/run.js'],
    delay: 2000
  },
  {
    name: 'web-server',
    command: 'node',
    args: ['--no-deprecation', 'src/web-server.js'],
    delay: 7000
  }
];

const processes = new Map();

// Handle cleanup
function cleanup() {
  console.log('\nShutting down services...');
  for (const [name, proc] of processes) {
    console.log(`Killing ${name}...`);
    proc.kill();
  }
  process.exit(0);
}

// Handle signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start services
for (const service of services) {
  setTimeout(() => {
    console.log(`Starting ${service.name}...`);
    const proc = spawn(service.command, service.args, {
      stdio: 'inherit'
    });
    
    processes.set(service.name, proc);
    
    proc.on('error', (err) => {
      console.error(`${service.name} failed to start:`, err);
    });
    
    proc.on('exit', (code, signal) => {
      if (code !== null) {
        console.log(`${service.name} exited with code ${code}`);
      } else {
        console.log(`${service.name} was killed with signal ${signal}`);
      }
      processes.delete(service.name);
      
      // If any service dies, kill everything
      if (processes.size > 0) {
        console.error('Service died, shutting down everything...');
        cleanup();
      }
    });
  }, service.delay);
} 