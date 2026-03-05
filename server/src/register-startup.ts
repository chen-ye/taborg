import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AutoLaunch from 'auto-launch';

import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../');
const serverDir = path.resolve(projectRoot, 'server');
const binDir = path.resolve(serverDir, 'bin');

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const isWindows = process.platform === 'win32';
const wrapperPath = isWindows 
  ? path.resolve(binDir, 'taborg-mcp-bridge.cmd')
  : path.resolve(binDir, 'taborg-mcp-bridge');

// Create the wrapper script
const scriptPath = path.resolve(serverDir, 'src/index.ts');

const command = process.argv[2];
const isDisable = command === 'disable';

// Parse optional arguments: --port=3033 --host=localhost
const args = process.argv.slice(isDisable ? 3 : 2).reduce((acc: Record<string, string>, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value;
  }
  return acc;
}, {});

const PORT = args['port'] || '3033';
const HOST = args['host'] || 'localhost';

const envVars = `PORT=${PORT} HOST=${HOST}`;
const envVarsWindows = `set PORT=${PORT} && set HOST=${HOST}`;

if (isWindows) {
  fs.writeFileSync(wrapperPath, `@echo off\n${envVarsWindows} && "${process.execPath}" "${scriptPath}" %*`);
} else {
  fs.writeFileSync(wrapperPath, `#!/bin/bash\nexport ${envVars}\n"${process.execPath}" "${scriptPath}" "$@"`);
  fs.chmodSync(wrapperPath, '755');
}

const taborgAutoLauncher = new AutoLaunch({
  name: 'TabOrgMCPBridge',
  path: wrapperPath,
  mac: {
    useLaunchAgent: true,
  },
});

async function setup() {
  const isEnabled = await taborgAutoLauncher.isEnabled();
  if (!isEnabled) {
    try {
      await taborgAutoLauncher.enable();
      console.log('Successfully enabled TabOrg MCP Bridge on startup.');
    } catch (err) {
      console.error('Failed to enable startup script:', err);
    }
  } else {
    // We re-enable it to update the wrapper if it already exists
    // (auto-launch enable is idempotent usually, but we want to make sure wrapper is updated)
    await taborgAutoLauncher.enable();
    console.log('TabOrg MCP Bridge startup registration updated.');
  }
}

async function disable() {
  const isEnabled = await taborgAutoLauncher.isEnabled();
  if (isEnabled) {
    try {
      await taborgAutoLauncher.disable();
      console.log('Successfully disabled TabOrg MCP Bridge on startup.');
    } catch (err) {
      console.error('Failed to disable startup script:', err);
    }
  } else {
    console.log('TabOrg MCP Bridge is not enabled on startup.');
  }
}

if (isDisable) {
  disable();
} else {
  setup();
}
