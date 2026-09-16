import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../');
const serverDir = path.resolve(projectRoot, 'server');
const binDir = path.resolve(serverDir, 'bin');

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

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

const PORT = args.port || '3033';
const HOST = args.host || 'localhost';

const WINDOWS_TASK_NAME = 'TabOrgMCPBridge';

function cleanPath(rawPath: string): string {
  return rawPath
    .split(':')
    .filter((entry) => {
      // Filter out temporary Yarn Berry / npm xfs directory paths
      if (entry.includes('xfs-')) return false;
      return entry.trim().length > 0;
    })
    .join(':');
}

function collectStartupEnv(port: string, host: string): Record<string, string> {
  const env: Record<string, string> = {
    PORT: port,
    HOST: host,
  };
  if (process.env.PATH) {
    env.PATH = cleanPath(process.env.PATH);
  }
  return env;
}

function systemdEscape(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildLinuxSystemdService(script: string, env: Record<string, string>): string {
  const envLines = Object.entries(env)
    .map(([k, v]) => `Environment="${k}=${systemdEscape(v)}"`)
    .join('\n');

  return `[Unit]
Description=TabOrg MCP Bridge Server
After=network-online.target

[Service]
Type=simple
${envLines}
ExecStart=/usr/bin/env node "${systemdEscape(script)}"
WorkingDirectory=%h
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function writeMacosLaunchAgent(script: string, env: Record<string, string>, logDir: string, plistPath: string): void {
  const plistData = {
    Label: 'taborg-mcp-bridge',
    ProgramArguments: ['/usr/bin/env', 'node', script],
    EnvironmentVariables: env,
    ProcessType: 'Background',
    RunAtLoad: true,
    KeepAlive: true,
    WorkingDirectory: os.homedir(),
    StandardOutPath: path.join(logDir, 'taborg-mcp-bridge.log'),
    StandardErrorPath: path.join(logDir, 'taborg-mcp-bridge.err.log'),
  };

  execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', plistPath, '-'], {
    input: JSON.stringify(plistData),
    encoding: 'utf8',
  });
}

function writeWindowsStartupWrapper(script: string, env: Record<string, string>, wrapper: string): void {
  const ps1Lines = [`$env:PORT = "${env.PORT || '3033'}"`, `$env:HOST = "${env.HOST || 'localhost'}"`];
  if (env.PATH) {
    ps1Lines.push(`$env:PATH = "${env.PATH.replace(/"/g, '`"')};" + $env:PATH`);
  }
  ps1Lines.push(`& node "${script.replace(/"/g, '`"')}"`);

  fs.mkdirSync(path.dirname(wrapper), { recursive: true });
  fs.writeFileSync(wrapper, ps1Lines.join('\r\n'), 'utf8');
}

async function setup() {
  if (process.platform === 'darwin') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
    const plistPath = path.resolve(os.homedir(), 'Library/LaunchAgents/taborg-mcp-bridge.plist');
    const logDir = path.resolve(os.homedir(), 'Library/Logs/TabOrg');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    }

    const env = collectStartupEnv(PORT, HOST);
    fs.mkdirSync(path.dirname(plistPath), { recursive: true, mode: 0o700 });
    writeMacosLaunchAgent(scriptPath, env, logDir, plistPath);
    fs.chmodSync(plistPath, '600');
    console.log(`Generated LaunchAgent plist with inherited environment at ${plistPath}`);

    // Clean up any legacy TabOrgMCPBridge.plist or shell script wrapper
    const legacyPlistPath = path.resolve(os.homedir(), 'Library/LaunchAgents/TabOrgMCPBridge.plist');
    if (fs.existsSync(legacyPlistPath)) {
      try {
        execSync(
          `launchctl bootout gui/${uid} "${legacyPlistPath}" 2>/dev/null || launchctl unload "${legacyPlistPath}" 2>/dev/null`,
        );
        fs.unlinkSync(legacyPlistPath);
      } catch {}
    }
    const legacyWrapperPath = path.resolve(binDir, 'taborg-mcp-bridge');
    if (fs.existsSync(legacyWrapperPath)) {
      try {
        fs.unlinkSync(legacyWrapperPath);
      } catch {}
    }

    // Unload existing service before loading new configuration
    try {
      execSync(
        `launchctl bootout gui/${uid} "${plistPath}" 2>/dev/null || launchctl unload "${plistPath}" 2>/dev/null`,
      );
    } catch {
      // Ignore if not currently loaded
    }

    try {
      execSync(`launchctl bootstrap gui/${uid} "${plistPath}"`);
      execSync(`launchctl kickstart -k gui/${uid}/taborg-mcp-bridge 2>/dev/null || true`);
      console.log('Successfully enabled and started TabOrg MCP Bridge LaunchAgent.');
    } catch (err) {
      // Fallback to legacy launchctl load if bootstrap is unavailable
      try {
        execSync(`launchctl load "${plistPath}"`);
        console.log('Loaded TabOrg MCP Bridge LaunchAgent (legacy load).');
      } catch (_fallbackErr) {
        console.error('Failed to load launchctl agent:', err);
      }
    }
    return;
  }

  if (process.platform === 'linux') {
    // Linux: systemd user service
    const serviceDir = path.resolve(os.homedir(), '.config/systemd/user');
    const servicePath = path.resolve(serviceDir, 'taborg-mcp-bridge.service');
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true, mode: 0o755 });
    }
    const env = collectStartupEnv(PORT, HOST);
    fs.writeFileSync(servicePath, buildLinuxSystemdService(scriptPath, env), { mode: 0o644 });
    console.log(`Generated systemd user service at ${servicePath}`);

    // Clean up any legacy autostart desktop file or wrapper script
    const legacyDesktopPath = path.resolve(os.homedir(), '.config/autostart/TabOrgMCPBridge.desktop');
    if (fs.existsSync(legacyDesktopPath)) {
      try {
        fs.unlinkSync(legacyDesktopPath);
      } catch {}
    }
    const legacyWrapperPath = path.resolve(binDir, 'taborg-mcp-bridge');
    if (fs.existsSync(legacyWrapperPath)) {
      try {
        fs.unlinkSync(legacyWrapperPath);
      } catch {}
    }

    try {
      execSync('systemctl --user daemon-reload');
      execSync('systemctl --user enable --now taborg-mcp-bridge.service');
      console.log('Successfully enabled and started TabOrg MCP Bridge systemd user service.');
    } catch (err) {
      console.error('Failed to enable systemd user service:', err);
    }
    return;
  }

  if (process.platform === 'win32') {
    // Windows: Task Scheduler via schtasks.exe
    const env = collectStartupEnv(PORT, HOST);
    const windowsWrapperPath = path.resolve(binDir, 'taborg-mcp-bridge.ps1');
    writeWindowsStartupWrapper(scriptPath, env, windowsWrapperPath);

    // Clean up any legacy .cmd wrapper
    const legacyCmdPath = path.resolve(binDir, 'taborg-mcp-bridge.cmd');
    if (fs.existsSync(legacyCmdPath)) {
      try {
        fs.unlinkSync(legacyCmdPath);
      } catch {}
    }

    const taskCommand = `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${windowsWrapperPath}"`;
    try {
      execSync(`schtasks.exe /Create /TN "${WINDOWS_TASK_NAME}" /SC ONLOGON /RL LIMITED /F /TR "${taskCommand}"`);
      execSync(`schtasks.exe /Run /TN "${WINDOWS_TASK_NAME}" 2>nul`);
      console.log(`Successfully registered and started Windows Scheduled Task "${WINDOWS_TASK_NAME}".`);
    } catch (err) {
      console.error('Failed to register Windows Scheduled Task:', err);
    }
    return;
  }

  console.warn(`Startup registration is not supported on platform: ${process.platform}`);
}

async function disable() {
  if (process.platform === 'darwin') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
    const plistPath = path.resolve(os.homedir(), 'Library/LaunchAgents/taborg-mcp-bridge.plist');
    if (fs.existsSync(plistPath)) {
      try {
        execSync(
          `launchctl bootout gui/${uid} "${plistPath}" 2>/dev/null || launchctl unload "${plistPath}" 2>/dev/null`,
        );
      } catch {}
      try {
        fs.unlinkSync(plistPath);
      } catch {}
      console.log('Removed TabOrg MCP Bridge LaunchAgent plist.');
    }
    const legacyPlistPath = path.resolve(os.homedir(), 'Library/LaunchAgents/TabOrgMCPBridge.plist');
    if (fs.existsSync(legacyPlistPath)) {
      try {
        execSync(
          `launchctl bootout gui/${uid} "${legacyPlistPath}" 2>/dev/null || launchctl unload "${legacyPlistPath}" 2>/dev/null`,
        );
      } catch {}
      try {
        fs.unlinkSync(legacyPlistPath);
      } catch {}
    }
    return;
  }

  if (process.platform === 'linux') {
    // Linux: systemd user service
    const servicePath = path.resolve(os.homedir(), '.config/systemd/user/taborg-mcp-bridge.service');
    try {
      execSync('systemctl --user disable --now taborg-mcp-bridge.service 2>/dev/null');
      execSync('systemctl --user daemon-reload 2>/dev/null');
    } catch {}
    if (fs.existsSync(servicePath)) {
      try {
        fs.unlinkSync(servicePath);
      } catch {}
      console.log('Removed TabOrg MCP Bridge systemd user service.');
    }
    const legacyDesktopPath = path.resolve(os.homedir(), '.config/autostart/TabOrgMCPBridge.desktop');
    if (fs.existsSync(legacyDesktopPath)) {
      try {
        fs.unlinkSync(legacyDesktopPath);
      } catch {}
    }
    return;
  }

  if (process.platform === 'win32') {
    // Windows: Task Scheduler via schtasks.exe
    try {
      execSync(`schtasks.exe /End /TN "${WINDOWS_TASK_NAME}" 2>nul`);
    } catch {}
    try {
      execSync(`schtasks.exe /Delete /TN "${WINDOWS_TASK_NAME}" /F 2>nul`);
      console.log(`Removed Windows Scheduled Task "${WINDOWS_TASK_NAME}".`);
    } catch {
      console.log(`Windows Scheduled Task "${WINDOWS_TASK_NAME}" was not registered.`);
    }
    const windowsWrapperPath = path.resolve(binDir, 'taborg-mcp-bridge.ps1');
    if (fs.existsSync(windowsWrapperPath)) {
      try {
        fs.unlinkSync(windowsWrapperPath);
      } catch {}
    }
    const legacyCmdPath = path.resolve(binDir, 'taborg-mcp-bridge.cmd');
    if (fs.existsSync(legacyCmdPath)) {
      try {
        fs.unlinkSync(legacyCmdPath);
      } catch {}
    }
    return;
  }

  console.warn(`Startup removal is not supported on platform: ${process.platform}`);
}

if (isDisable) {
  disable();
} else {
  setup();
}
