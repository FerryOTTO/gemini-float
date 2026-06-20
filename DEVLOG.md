# Gemini Float 开发日志

> 项目路径：`E:\create\`
> 创建时间：2026-06-20
> 技术栈：Electron 28 + Node.js

---

## 项目结构

```
E:\create\
├── main.js           # 主进程（窗口、快捷键、截图、注入）
├── preload.js        # 安全桥接（contextBridge IPC）
├── start.cjs         # 启动器（清除 ELECTRON_RUN_AS_NODE）
├── package.json      # 项目配置
├── icon.ico          # 桌面快捷方式图标（蓝紫渐变 G）
├── icon.png          # 图标源文件
├── GeminiFloat.bat   # 启动批处理
├── README.md         # 用户文档
└── DEVLOG.md         # 本文件（开发日志）
```

---

## 关键技术决策与踩坑记录

### 1. Electron 模块加载问题（最坑）

**现象**：`require('electron')` 返回字符串（exe 路径），而非 API 对象。`process.type` 为 `undefined`。

**根因**：RTK（Rust Token Killer）工具会设置环境变量 `ELECTRON_RUN_AS_NODE=1`，导致 Electron 以纯 Node.js 模式运行，浏览器进程不初始化。

**解决**：创建 `start.cjs` 启动器，在启动 Electron 前清除该环境变量：

```javascript
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, args, { env });
```

**教训**：任何 Electron 应用如果出现 `require('electron')` 返回字符串的问题，先检查 `ELECTRON_RUN_AS_NODE` 环境变量。

---

### 2. 窗口拖拽问题（折腾最久）

**尝试过的方案**：

| 方案 | 结果 | 原因 |
|------|------|------|
| `-webkit-app-region: drag`（CSS 注入） | ❌ 不生效 | Gemini 网页 JS 可能删除注入的元素 |
| `pointer-events: none` + JS mousedown | ❌ 不生效 | pointer-events: none 导致 drag 失效 |
| PowerShell 调用 Win32 API `SendMessage` | ❌ 不生效 | execSync 执行太慢/转义问题 |
| `titleBarOverlay` + 自定义 CSS drag | ❌ 冲突 | 两者同时用会互相干扰 |
| 单独 `titleBarOverlay`（原生方案） | ✅ 生效 | 系统级别，不受网页影响 |

**最终方案**：使用 Electron 原生 `titleBarOverlay`

```javascript
const win = new BrowserWindow({
  frame: false,
  titleBarStyle: "hidden",    // 关键：隐藏但保留拖拽能力
  titleBarOverlay: {
    color: "#0c0c18",
    symbolColor: "#aaaacc",
    height: 36,
  },
});
```

**教训**：对于加载第三方网页的 frameless 窗口，CSS 注入的 `-webkit-app-region: drag` 不可靠。应优先使用 `titleBarOverlay`。

---

### 3. 圆角实现

**方案**：使用 `win.setShape()` 原生 API

```javascript
function getRoundedRectangles(width, height, radius) {
  // 逐行计算圆角内缩，合并相邻行减少矩形数量
  // 上方圆角：inset = ceil(r - sqrt(r² - (r-y)²))
  // 下方圆角：inset = ceil(r - sqrt(r² - (dy+1)²))  ← 注意 +1
}
```

**踩坑**：下方圆角公式需要 `(dy+1)` 而非 `dy`，否则底部圆角只有 ~8px 而非 12px。

---

### 4. 反检测（绕过谷歌风控）

注入以下内容到页面：
- `navigator.webdriver = undefined`
- 完整的 `chrome.runtime` 对象
- 模拟 `plugins`（3 个标准插件）
- `navigator.languages` = `['zh-CN', 'zh', 'en-US', 'en']`
- WebGL 渲染器信息伪装
- `Permissions.query` 行为修正

---

### 5. 截图粘贴工作流

```
Ctrl+Shift+A → 隐藏窗口 → PowerShell 模拟 Win+Shift+S
→ 轮询剪贴板（200ms 间隔）→ 检测新图片 → 显示窗口
→ executeJavaScript 定位输入框 → webContents.paste()
```

**关键**：轮询剪贴板前保存快照，通过图片尺寸+数据长度比对变化。

---

### 6. 注入时机问题

| 方案 | 效果 |
|------|------|
| `dom-ready` | 太早，页面未完全加载 |
| `did-finish-load` + setTimeout(1500) | 不稳定 |
| `setInterval` 轮询检查 + `executeJavaScript` | ✅ 最可靠 |

---

## 当前状态（2026-06-20）

### ✅ 已完成
- [x] 竖版小窗模式（420×680）
- [x] 大窗模式（屏幕 75%）+ Ctrl+Shift+M 切换
- [x] 原生拖拽（titleBarOverlay）
- [x] 四角圆角（setShape）
- [x] 反检测登录
- [x] Alt+Space 唤醒/隐藏
- [x] Ctrl+Shift+A 截图自动粘贴
- [x] Esc 隐藏
- [x] Gemini SVG 图标
- [x] 桌面快捷方式（蓝紫渐变 G 图标）

### ⚠️ 已知问题
- [ ] 截图响应稍慢（~200ms 轮询 + ~300ms 粘贴延迟）
- [ ] 自定义 Gemini 图标/模式按钮注入后可能被 Gemini 页面 JS 覆盖
- [ ] `setShape` 圆角在某些系统上可能有性能问题

### 🔧 可优化方向
- [ ] 用 `electron-store` 持久化用户配置（窗口位置、大小、模式）
- [ ] 添加系统托盘图标
- [ ] 截图后显示悬浮预览
- [ ] 支持多显示器
- [ ] 打包为 `.exe` 安装程序（electron-builder）

---

## 启动方式

```bash
cd E:\create
npm install    # 首次
npm start      # 启动（= node start.cjs）
```

桌面快捷方式：`C:\Users\admin\Desktop\Gemini Float.lnk`
