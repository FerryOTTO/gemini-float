// ═══════════════════════════════════════════════════════════════
//  start.cjs — Gemini Float 启动器
//
//  功能：检测 7890 端口代理，配置命令行代理参数，然后启动 Electron
// ═══════════════════════════════════════════════════════════════

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

// 清除会导致问题的环境变量
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

// Electron 二进制路径
const electronPath = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

function checkProxy(port = 7890, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function start() {
  const args = [path.join(__dirname, 'main.js')];

  const hasProxy = await checkProxy(7890, '127.0.0.1');
  if (hasProxy) {
    console.log('[GeminiFloat] 检测到 7890 端口代理已启用，自动配置命令行代理');
    args.push('--proxy-server=socks5://127.0.0.1:7890');
    args.push('--proxy-bypass-list=<-loopback>');
  } else {
    console.log('[GeminiFloat] 未检测到 7890 端口代理，使用系统默认网络');
  }

  console.log('[GeminiFloat] 启动中...');

  const child = spawn(electronPath, args, {
    stdio: 'ignore',
    env: env,
    cwd: __dirname,
    detached: true,
    windowsHide: false,
  });

  child.unref();
  process.exit(0);
}

start();
