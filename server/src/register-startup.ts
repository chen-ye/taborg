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
if (isWindows) {
  fs.writeFileSync(wrapperPath, `@echo off\n"${process.execPath}" "${scriptPath}" %*`);
} else {
  fs.writeFileSync(wrapperPath, `#!/bin/bash\n"${process.execPath}" "${scriptPath}" "$@"`);
  fs.chmodSync(wrapperPath, '755');
}

const taborgAutoLauncher = new AutoLaunch({
  name: 'TabOrgMCPBridge',
  path: wrapperPath,
  mac: {
    useLaunchAgent: true,
  },
});

// Since auto-launch is limited in how it handles arguments for Launch Agents,
// we'll manually fix the plist if needed, or better, use a simpler command.
// For now, let's just use the node path and see.


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
    console.log('TabOrg MCP Bridge is already enabled on startup.');
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

const command = process.argv[2];

if (command === 'disable') {
  disable();
} else {
  setup();
}
