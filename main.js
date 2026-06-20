// ═══════════════════════════════════════════════════════════════════
//  Gemini Float — 专属于 Windows 的 Gemini 悬浮小窗客户端
//  功能：无边框悬浮窗 · Alt+Space 唤醒/隐藏 · 截图自动粘贴 · 反检测登录
// ═══════════════════════════════════════════════════════════════════

const {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
  ipcMain,
  nativeImage,
  screen,
  shell,
} = require("electron");

const path = require("path");
const fs = require("fs");
const { exec, execSync, spawnSync } = require("child_process");

// ───────────────────────────────────────────────────────────────────
// § 1. 配置常量
// ───────────────────────────────────────────────────────────────────
const CONFIG = {
  URL: "https://gemini.google.com/app",
  // 小窗模式尺寸 — 竖版（参考豆包）
  MINI_WIDTH: 420,
  MINI_HEIGHT: 680,
  // 大窗模式尺寸（启动时占屏幕 75%）
  NORMAL_RATIO: 0.75,
  // 最小窗口尺寸
  MIN_WIDTH: 360,
  MIN_HEIGHT: 500,
  // UA 伪装
  UA: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  // 圆角半径
  BORDER_RADIUS: 12,
  // 标题栏高度
  TITLEBAR_HEIGHT: 34,
  // 截图相关（提速）
  CLIPBOARD_POLL_MS: 200,
  CLIPBOARD_TIMEOUT_MS: 30000,
  PASTE_DELAY_MS: 300,
};

// ───────────────────────────────────────────────────────────────────
// § 2. 全局状态
// ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let clipboardTimer = null;
let isMonitoring = false;
let baselineImageHash = "";
let isMiniMode = true; // 当前窗口模式：true=小窗 false=大窗
let lastShowTime = 0;  // 上次显示时间戳，用于 blur 防抖
const BLUR_GRACE_MS = 5000; // 显示后 5 秒内不自动隐藏
let tray = null;       // 系统托盘实例

// ───────────────────────────────────────────────────────────────────
// § 3. 反检测初始化
// ───────────────────────────────────────────────────────────────────
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch("disable-features", "AutomationControlled");

// ───────────────────────────────────────────────────────────────────
// § 4. 单实例锁
// ───────────────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      lastShowTime = Date.now();
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ───────────────────────────────────────────────────────────────────
// § 5. 应用生命周期
// ───────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setAppUserModelId("com.gemini.float");
  createWindow();
  registerGlobalShortcuts();
  createTray();
});

app.on("window-all-closed", () => {});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopClipboardMonitoring();
  if (tray) {
    tray.destroy();
  }
});

// ───────────────────────────────────────────────────────────────────
// § 5.1 开机自启设置
// ───────────────────────────────────────────────────────────────────
function isAutoStartEnabled() {
  try {
    const res = spawnSync("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      "/v",
      "GeminiFloat"
    ]);
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

function setAutoStart(enabled) {
  try {
    const launchVbsPath = path.join(__dirname, "launch.vbs");
    if (enabled) {
      const data = `wscript.exe "${launchVbsPath}"`;
      const res = spawnSync("reg", [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        "/v",
        "GeminiFloat",
        "/t",
        "REG_SZ",
        "/d",
        data,
        "/f"
      ]);
      return res.status === 0;
    } else {
      const res = spawnSync("reg", [
        "delete",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        "/v",
        "GeminiFloat",
        "/f"
      ]);
      return res.status === 0;
    }
  } catch (e) {
    console.error("[GeminiFloat] 设置自启失败:", e);
    return false;
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.ico');
    if (fs.existsSync(iconPath)) {
      const { Menu, Tray } = require('electron');
      tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: '显示窗口 (Alt+Space)', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
        { label: '隐藏窗口', click: () => { if (mainWindow) { mainWindow.hide(); } } },
        { type: 'separator' },
        {
          label: '开机自启',
          type: 'checkbox',
          checked: isAutoStartEnabled(),
          click: (menuItem) => {
            setAutoStart(menuItem.checked);
          }
        },
        { type: 'separator' },
        { label: '退出 Gemini Float', click: () => { app.isQuitting = true; app.quit(); } }
      ]);
      tray.setToolTip('Gemini Float');
      tray.setContextMenu(contextMenu);
      tray.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      });
    }
  } catch (e) {
    console.error('[GeminiFloat] 创建托盘图标失败:', e);
  }
}

// ───────────────────────────────────────────────────────────────────
// § 6. 创建主窗口
// ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: CONFIG.MINI_WIDTH,
    height: CONFIG.MINI_HEIGHT,
    minWidth: CONFIG.MIN_WIDTH,
    minHeight: CONFIG.MIN_HEIGHT,
    // ── 原生无边框 + 可拖拽方案 ──
    // titleBarStyle: 'hidden' 隐藏标题栏但保留拖拽区域
    // titleBarOverlay 叠加原生窗口按钮
    // 这两个配合使用，拖拽是系统级别的，不受网页 JS 影响
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0c0c18",       // 按钮区域背景色（深色）
      symbolColor: "#aaaacc", // 按钮符号颜色（浅色）
      height: 36,             // 拖拽区域高度
    },
    transparent: false,
    resizable: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    backgroundColor: "#1e1e2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      userAgent: CONFIG.UA,
    },
  });

  // ── 拦截并剥离 Content-Security-Policy 头部，解决 TrustedHTML 限制 ──
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[key];
      }
    }
    callback({ cancel: false, responseHeaders });
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.center();

  // 拦截新窗口打开请求，将外部链接路由到系统默认浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (
        parsed.hostname === 'gemini.google.com' ||
        parsed.hostname === 'accounts.google.com'
      ) {
        if (url.includes('/app') || url.includes('/signin') || url.includes('/ServiceLogin')) {
          return { action: 'allow' };
        }
      }
      shell.openExternal(url).catch(() => {});
    } catch (e) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // 设置窗口图标
  try {
    mainWindow.setIcon(path.join(__dirname, 'icon.png'));
  } catch (e) { /* 静默降级 */ }

  // 圆角形状 — 使用原生 setShape，比 CSS 更可靠
  applyWindowShape();

  // 窗口大小改变时重新应用圆角
  mainWindow.on("resize", () => {
    setTimeout(() => applyWindowShape(), 50);
  });

  let injected = false;
  // 注入脚本 — did-finish-load 主触发 + 轮询兜底
  // 关键：检查 isLoading() 避免在页面跳转时注入（会导致 Script failed to execute）
  function attemptInjection() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isLoading()) return; // 页面仍在加载/跳转，跳过

    const currentUrl = mainWindow.webContents.getURL();
    console.log('[GeminiFloat] 尝试注入, 当前 URL:', currentUrl);

    mainWindow.webContents.executeJavaScript(
      `!!document.getElementById('gf-bar')`
    ).then((exists) => {
      if (!exists) {
        console.log('[GeminiFloat] 开始注入');
        injectAntiDetection();
        injectCustomTitleBar();
        injectKeyListeners();
        injected = false;
      } else if (!injected) {
        injected = true;
        console.log('[GeminiFloat] 检测到已注入');
      }
    }).catch(() => {}); // 正在跳转时静默忽略
  }

  // 主触发：页面加载完成后延迟 500ms 注入
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[GeminiFloat] 页面加载完成，准备注入');
    setTimeout(attemptInjection, 500);
  });

  // 兜底轮询：每 2 秒检查一次（防止 SPA 内部跳转后失效）
  const injectTimer = setInterval(attemptInjection, 2000);

  mainWindow.loadURL(CONFIG.URL);

  mainWindow.once("ready-to-show", () => {
    lastShowTime = Date.now();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });

  // show:true 已保证窗口创建即显示，这里只刷新 lastShowTime
  lastShowTime = Date.now();
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      lastShowTime = Date.now();
      mainWindow.focus();
      console.log("[GeminiFloat] 窗口已显示");
    }
  }, 500);

  // ── 拖拽与界面下移配置 ──
  function applyDragCSS() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.insertCSS(
      // 整个标题栏：开启 -webkit-app-region: drag 进行拖拽，启用 pointer-events
      '#gf-bar { -webkit-app-region: drag !important; pointer-events: auto !important; }' +
      // 左右区块和按钮：设置为 no-drag 以便可以正常响应鼠标点击
      '#gf-bar .l, #gf-bar .r, #gf-bar button, .gm { -webkit-app-region: no-drag !important; pointer-events: auto !important; }'
    ).catch(() => {});
  }

  // 每次页面 dom-ready 后重新注入（Gemini SPA 内部跳转也能生效）
  mainWindow.webContents.on('dom-ready', () => {
    applyDragCSS();
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Browser Console] [Line ${line}] ${message}`);
  });

  // 失焦隐藏：3 秒宽限期内不隐藏（防止启动时立即被遮盖）
  mainWindow.on("blur", () => {
    if (!isMonitoring && isMiniMode) {
      const elapsed = Date.now() - lastShowTime;
      if (elapsed > BLUR_GRACE_MS) {
        mainWindow.hide();
      }
    }
  });

  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ───────────────────────────────────────────────────────────────────
// § 7. 圆角窗口形状（原生 API，Windows 可靠方案）
// ───────────────────────────────────────────────────────────────────

/**
 * 生成圆角矩形的矩形区域数组（用于 setShape）
 * 四个角都做圆角处理，合并相邻相同宽度的行减少矩形数量
 */
function getRoundedRectangles(width, height, radius) {
  const r = Math.min(radius, Math.floor(width / 2), Math.floor(height / 2));
  if (r <= 0) return [{ x: 0, y: 0, width, height }];

  const rows = [];
  for (let y = 0; y < height; y++) {
    let inset = 0;

    if (y < r) {
      // ── 上方圆角 ──
      // y=0 → inset=r（最外圈），y=r-1 → inset≈1（靠内）
      inset = Math.ceil(r - Math.sqrt(r * r - (r - y) * (r - y)));
    } else if (y >= height - r) {
      // ── 下方圆角 ──
      // 用 (dy+1) 保证最后一行 inset=r
      const dy = y - (height - r);
      inset = Math.ceil(r - Math.sqrt(r * r - (dy + 1) * (dy + 1)));
    }

    rows.push({ inset, y });
  }

  // 合并相邻且 inset 相同的行
  const rects = [];
  let cur = null;
  for (const row of rows) {
    if (cur && cur.inset === row.inset) {
      cur.h++;
    } else {
      if (cur) rects.push({ x: cur.inset, y: cur.y, width: width - cur.inset * 2, height: cur.h });
      cur = { inset: row.inset, y: row.y, h: 1 };
    }
  }
  if (cur) rects.push({ x: cur.inset, y: cur.y, width: width - cur.inset * 2, height: cur.h });

  return rects;
}

/**
 * 将圆角形状应用到窗口
 * 小窗模式：12px 圆角
 * 大窗模式：8px 圆角（更 subtle）
 */
function applyWindowShape() {
  if (!mainWindow) return;
  try {
    const [w, h] = mainWindow.getSize();
    const r = isMiniMode ? CONFIG.BORDER_RADIUS : 8;
    const shapes = getRoundedRectangles(w, h, r);
    mainWindow.setShape(shapes);
  } catch (e) {
    // 某些平台不支持 setShape，静默降级
  }
}

// ───────────────────────────────────────────────────────────────────
// § 8. 窗口模式切换
// ───────────────────────────────────────────────────────────────────
function toggleWindowMode() {
  if (!mainWindow) return;
  isMiniMode = !isMiniMode;

  if (isMiniMode) {
    // → 小窗模式
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setSkipTaskbar(true);
    mainWindow.setMinimumSize(CONFIG.MIN_WIDTH, CONFIG.MIN_HEIGHT);
    mainWindow.setSize(CONFIG.MINI_WIDTH, CONFIG.MINI_HEIGHT);
  } else {
    // → 大窗模式
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSkipTaskbar(false);
    // 计算屏幕 75% 尺寸
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = Math.floor(sw * CONFIG.NORMAL_RATIO);
    const h = Math.floor(sh * CONFIG.NORMAL_RATIO);
    mainWindow.setMinimumSize(400, 300);
    mainWindow.setSize(w, h);
  }

  mainWindow.center();

  // 重新应用圆角形状
  setTimeout(() => applyWindowShape(), 100);

  // 通知渲染进程更新按钮图标
  updateModeButton();
}

function updateModeButton() {
  if (!mainWindow) return;
  const icon = isMiniMode ? "⬜" : "❐";
  const label = isMiniMode ? "大窗" : "小窗";
  mainWindow.webContents
    .executeJavaScript(
      `(function(){
      var b=document.getElementById('gf-mode-btn');
      if(b){b.textContent='${icon}';b.title='切换到${label}模式';}
    })()`
    )
    .catch(() => {});
}

// ───────────────────────────────────────────────────────────────────
// § 8. 注入脚本
// ───────────────────────────────────────────────────────────────────
function injectAntiDetection() {
  const script = `
    (function() {
      'use strict';
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
      if (!window.chrome) window.chrome = {};
      window.chrome.app = { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } };
      window.chrome.runtime = { OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }, OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }, connect: function() {}, sendMessage: function() {} };
      Object.defineProperty(navigator, 'plugins', { get: () => { const arr = [{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 }, { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 }, { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 }]; arr.length = 3; return arr; }, configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'], configurable: true });
      if (navigator.permissions) { const o = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = (p) => { if (p.name === 'notifications') return Promise.resolve({ state: Notification.permission, onchange: null }); return o(p); }; }
      const g = WebGLRenderingContext.prototype.getParameter; WebGLRenderingContext.prototype.getParameter = function(p) { if (p === 37445) return 'Google Inc. (Intel)'; if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)'; return g.apply(this, arguments); };
    })();
  `;
  mainWindow.webContents.executeJavaScript(script).catch(() => {});
}

function injectCustomTitleBar() {
  // titleBarOverlay 已提供原生窗口按钮
  // 注入 Gemini 图标 + 模式切换 + 拖拽区域
  const js = `
    (function() {
      try {
        if (!document || !document.head || !document.body) return;
        if (document.getElementById('gf-bar')) return;

        var s = document.createElement('style');
        s.textContent =
          'html{height:100vh !important;overflow:hidden !important;}' +
          'body{transform:translateY(36px) !important;height:calc(100vh - 36px) !important;margin:0 !important;position:relative !important;}' +
          '#gf-bar{-webkit-app-region:drag !important;position:fixed !important;top:0 !important;left:0 !important;right:0 !important;height:36px !important;background:rgba(12,12,24,0.95) !important;display:flex !important;align-items:center !important;justify-content:space-between !important;padding:0 12px !important;padding-right:130px !important;z-index:2147483647 !important;font-family:"Segoe UI",system-ui,sans-serif !important;user-select:none !important;pointer-events:auto !important}' +
          '#gf-bar .l,#gf-bar .r,#gf-bar button,.gm{-webkit-app-region:no-drag !important;pointer-events:auto !important}' +
          '#gf-bar .l,#gf-bar .r{display:flex;align-items:center;gap:8px}' +
          '#gf-bar .t{color:#aaa;font-size:11px;font-weight:500;letter-spacing:.5px}' +
          '#gf-bar .i{filter:drop-shadow(0 0 6px rgba(66,133,244,.5))}' +
          '.gm{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);height:20px;padding:0 8px;border-radius:4px;font-size:11px;color:#888;cursor:pointer}' +
          '.gm:hover{background:rgba(255,255,255,.15);color:#ccc}' +
          '';
        document.head.appendChild(s);

        var b = document.createElement('div');
        b.id = 'gf-bar';
        b.innerHTML =
          '<span class="l">' +
            '<svg class="i" width="18" height="18" viewBox="0 0 28 28" fill="none">' +
              '<defs><linearGradient id="gstar" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">' +
                '<stop stop-color="#4285F4"/>' +
                '<stop offset="0.5" stop-color="#9B72FF"/>' +
                '<stop offset="1" stop-color="#D96570"/>' +
              '</linearGradient></defs>' +
              '<path d="M14 2 C14 2 15.8 9.2 22 11 C15.8 12.8 14 20 14 20 C14 20 12.2 12.8 6 11 C12.2 9.2 14 2 14 2Z" fill="url(#gstar)"/>' +
              '<path d="M22 16 C22 16 22.9 19.5 26 20.5 C22.9 21.5 22 25 22 25 C22 25 21.1 21.5 18 20.5 C21.1 19.5 22 16 22 16Z" fill="url(#gstar)" opacity="0.75"/>' +
            '</svg>' +
            '<span class="t">Gemini</span>' +
          '</span>' +
          '<span class="r">' +
            '<button class="gm" id="gf-mode-btn" title="Switch" onclick="window.geminiFloat&&window.geminiFloat.toggleMode()">=</button>' +
          '</span>';
        document.documentElement.appendChild(b);
      } catch(e) {
        console.error('[GeminiFloat] inject error:', e.message);
      }
    })();
  `;
  mainWindow.webContents.executeJavaScript(js).catch((err) => {
    console.error('[GeminiFloat] 注入标题栏失败:', err.message);
  });
}

function injectKeyListeners() {
  mainWindow.webContents
    .executeJavaScript(
      `document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') window.geminiFloat.hide();
      }, true);`
    )
    .catch(() => {});
}

// ───────────────────────────────────────────────────────────────────
// § 9. 注册全局快捷键
// ───────────────────────────────────────────────────────────────────
function registerGlobalShortcuts() {
  // Alt+Space — 唤醒/隐藏
  globalShortcut.register("Alt+Space", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
      if (isMiniMode) mainWindow.setAlwaysOnTop(true);
    }
  });

  // Ctrl+Shift+A — 截图粘贴
  globalShortcut.register("CommandOrControl+Shift+A", () => {
    startScreenshotWorkflow();
  });

  // Ctrl+Shift+M — 切换大/小窗模式
  globalShortcut.register("CommandOrControl+Shift+M", () => {
    toggleWindowMode();
  });

  console.log("[GeminiFloat] 快捷键注册完成");
}

// ───────────────────────────────────────────────────────────────────
// § 10. 截图工作流
// ───────────────────────────────────────────────────────────────────
function startScreenshotWorkflow() {
  if (isMonitoring) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  baselineImageHash = getClipboardImageHash();
  setTimeout(() => {
    triggerWindowsSnippingTool();
    startClipboardMonitoring();
  }, 200);
}

function triggerWindowsSnippingTool() {
  try {
    shell.openExternal("ms-screenclip:");
  } catch (err) {
    console.error("[截图] 启动失败:", err.message);
  }
}

function startClipboardMonitoring() {
  isMonitoring = true;
  let elapsed = 0;
  clipboardTimer = setInterval(() => {
    elapsed += CONFIG.CLIPBOARD_POLL_MS;
    if (elapsed > CONFIG.CLIPBOARD_TIMEOUT_MS) {
      stopClipboardMonitoring();
      return;
    }
    const hash = getClipboardImageHash();
    if (hash && hash !== baselineImageHash) {
      stopClipboardMonitoring();
      handleScreenshotCaptured();
    }
  }, CONFIG.CLIPBOARD_POLL_MS);
}

function stopClipboardMonitoring() {
  if (clipboardTimer) {
    clearInterval(clipboardTimer);
    clipboardTimer = null;
  }
  isMonitoring = false;
}

function getClipboardImageHash() {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return "";
    const size = img.getSize();
    return size.width + "x" + size.height + "_" + img.toDataURL().length;
  } catch {
    return "";
  }
}

function handleScreenshotCaptured() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  if (isMiniMode) mainWindow.setAlwaysOnTop(true);
  setTimeout(async () => {
    try {
      await mainWindow.webContents.executeJavaScript(
        `(function() {
          var sels = ['.ql-editor','[contenteditable="true"]','[role="textbox"]','textarea'];
          for (var i=0;i<sels.length;i++) {
            var el = document.querySelector(sels[i]);
            if (el && el.offsetParent !== null) { el.focus(); return true; }
          }
          return false;
        })()`
      );
      mainWindow.webContents.paste();
    } catch (err) {
      console.error("[粘贴] 失败:", err.message);
    }
  }, CONFIG.PASTE_DELAY_MS);
}

// ───────────────────────────────────────────────────────────────────
// § 11. IPC 通信
// ───────────────────────────────────────────────────────────────────
ipcMain.on("win:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on("win:hide", () => {
  if (mainWindow) mainWindow.hide();
});
ipcMain.on("win:close", () => {
  if (mainWindow) mainWindow.hide();
});
ipcMain.on("win:toggleMode", () => {
  toggleWindowMode();
});

// ── 原生窗口拖拽（写入临时 ps1 文件执行，避免转义问题）──
ipcMain.on("win:startDrag", () => {
  if (!mainWindow) return;
  try {
    const hwnd = mainWindow.getNativeWindowHandle().readUInt32LE();
    const ps1 = path.join(app.getPath("temp"), "gf_drag.ps1");
    fs.writeFileSync(
      ps1,
      `Add-Type @"\nusing System;\nusing System.Runtime.InteropServices;\npublic class D{\n  [DllImport("user32.dll")]public static extern bool ReleaseCapture();\n  [DllImport("user32.dll")]public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);\n}\n"@\n[D]::ReleaseCapture()\n[D]::SendMessage([IntPtr]${hwnd},0x00A1,[IntPtr]2,[IntPtr]0)\n`
    );
    execSync(`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}"`);
    try { fs.unlinkSync(ps1); } catch (_) {}
  } catch (e) {
    console.error("[拖拽] 失败:", e.message);
  }
});

ipcMain.handle("win:isVisible", () =>
  mainWindow ? mainWindow.isVisible() : false
);

app.on("before-quit", () => {
  app.isQuitting = true;
});
