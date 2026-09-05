import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AutoLaunch from 'auto-launch';

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
  const windowsContent = `@echo off\r\n${envVarsWindows}\r\nwhere node >nul 2>nul\r\nif %ERRORLEVEL% equ 0 (\r\n  node "${scriptPath}" %*\r\n) else (\r\n  "${process.execPath}" "${scriptPath}" %*\r\n)\r\n`;
  fs.writeFileSync(wrapperPath, windowsContent);
} else {
  const unixContent = `#!/bin/bash
export ${envVars}

# Ensure PATH includes common node version managers (fnm, nvm, volta, asdf) and system/homebrew paths
export PATH="$HOME/.fnm/aliases/default/bin:$HOME/.fnm/current/bin:$HOME/.volta/bin:$HOME/.asdf/shims:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd false 2>/dev/null)"
fi

NODE_BIN="$(command -v node 2>/dev/null)"

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  if [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
  elif [ -x "${process.execPath}" ]; then
    NODE_BIN="${process.execPath}"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  echo "Error: Node.js executable not found." >&2
  exit 1
fi

exec "$NODE_BIN" "${scriptPath}" "$@"
`;
  fs.writeFileSync(wrapperPath, unixContent);
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

  if (process.platform === 'darwin') {
    try {
      const plistPath = path.resolve(process.env.HOME || '', 'Library/LaunchAgents/taborg-mcp-bridge.plist');
      if (fs.existsSync(plistPath)) {
        try {
          execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
        } catch {
          // Ignore if not loaded
        }
        execSync(`launchctl load "${plistPath}"`);
        console.log('Reloaded launchctl agent for taborg-mcp-bridge.');
      }
    } catch (err) {
      console.error('Failed to reload launchctl agent:', err);
    }
  }
}

async function disable() {
  if (process.platform === 'darwin') {
    try {
      const plistPath = path.resolve(process.env.HOME || '', 'Library/LaunchAgents/taborg-mcp-bridge.plist');
      if (fs.existsSync(plistPath)) {
        try {
          execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
  }
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
