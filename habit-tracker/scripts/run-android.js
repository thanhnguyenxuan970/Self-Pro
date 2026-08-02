const { spawnSync } = require('node:child_process');

// NDK 27's Windows Clang frontend is unstable when CMake builds Fabric codegen in parallel.
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxCommand, ['expo', 'run:android', ...process.argv.slice(2)], {
  env: { ...process.env, CMAKE_BUILD_PARALLEL_LEVEL: '1' },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
