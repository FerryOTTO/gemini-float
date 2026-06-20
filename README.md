# ✦ Gemini Float — Windows 极致悬浮小窗客户端

> 专属于 Windows 的 Gemini 官方网页端悬浮小窗，极致美观，功能强悍，体验拉满。

---

## 📸 功能一览

| 功能 | 说明 |
|------|------|
| 🪟 **无边框悬浮窗** | 深色磨砂卡片质感，置顶显示，支持 Windows 11/10 原生圆角形状。 |
| 🔀 **双窗口模式** | 支持 **小窗模式** (Mini, 420x680 竖版布局，适合常驻侧边) 与 **大窗模式** (Normal, 占屏幕 75%，适合沉浸式工作)。支持 `Ctrl+Shift+M` 或点击标题栏按钮一键切换。 |
| ⌨️ **`Alt + Space`** | **全局快捷键**：一键快速唤醒或隐藏悬浮窗，即用即走。 |
| 📸 **`Ctrl + Shift + A`** | **智能截图流程**：快捷键隐藏小窗并触发系统截图 -> 框选截图 -> 小窗自动拉起 -> 聚焦输入框 -> 自动粘贴图片。整个流程仅需 1 秒。 |
| 🚀 **开机自启** | 在系统右下角托盘图标中，提供“开机自启”勾选项，一键写入/清理当前用户注册表启动项。 |
| 🔗 **外部链接路由** | 小窗内所有点击的外部网址（如参考链接、Google Docs 等）都会**自动路由到系统默认浏览器**打开，仅保留 Gemini 内部和 Google 账号登录流在小窗内运行，极佳的 UX 体验。 |
| 🌐 **智能代理适配** | 启动时自动探测 `127.0.0.1:7890` 的 SOCKS5 代理端口，检测成功后自动为 Electron 配置全局 SOCKS5 代理。 |
| 🙈 **失焦/Esc 隐藏** | 窗口失焦（或按下 `Esc`）会自动隐藏，并带有 5 秒启动防抖宽限期，防止启动时立即被遮盖。 |
| 🔐 **安全登录反检测** | 内置伪装 Chrome 最新版 User-Agent 加上主流指纹擦除，绕过 Google 账号登录时的“不安全浏览器”安全检测阻拦。 |

---

## 🛠 环境要求

- **操作系统**: Windows 10 / Windows 11
- **Node.js**: 18+ (推荐 20 LTS) — [下载地址](https://nodejs.org/)
- **npm**: 随 Node.js 自带

---

## 📦 安装与运行

### 第一步：安装依赖

进入项目根目录：
```bash
cd gemini-float
npm install
```

> **国内加速**：如果 Electron 安装包下载缓慢，可临时设置镜像：
> ```bash
> npm config set electron_mirror https://npmmirror.com/mirrors/electron/
> npm install
> ```

### 第二步：双击运行或生成快捷方式

1. **直接启动（静默模式）**：
   - 运行项目根目录下的 `create_shortcut.ps1` 脚本（右键 -> 使用 PowerShell 运行，或者在终端运行）：
     ```powershell
     powershell -ExecutionPolicy Bypass -File create_shortcut.ps1
     ```
   - 脚本会自动检测您系统的 `node` 路径，并生成自适应绝对路径的 `launch.vbs` 后台静默启动器，同时在您的**桌面上生成一个 `Gemini Float` 的快捷方式**（带有专门生成的彩色 Gemini 图标）。
2. **调试启动**：
   - 如果您需要在控制台中查看日志，可运行：
     ```bash
     npm start
     ```

---

## ⌨️ 快捷键说明

| 快捷键 | 作用 | 范围 |
|--------|------|------|
| `Alt + Space` | 唤醒 / 隐藏悬浮窗 | 全局 |
| `Ctrl + Shift + A` | 触发系统截图并自动粘贴 | 全局 |
| `Ctrl + Shift + M` | 切换大窗 / 小窗模式 | 全局 |
| `Esc` | 隐藏悬浮窗 | 仅窗口聚焦时 |

---

## 📸 智能截图工作流

```
按下 Ctrl+Shift+A
       │
       ▼
  悬浮窗自动隐藏（让你看清桌面）
       │
       ▼
  系统截图工具启动（ms-screenclip）
       │
       ▼
  你框选截图区域并松开鼠标
       │
       ▼
  剪贴板检测到新图片
       │
       ▼
  悬浮窗自动拉起并置顶
       │
       ▼
  自动定位到 Gemini 输入框并执行 Paste
```

---

## 🔧 自定义配置

您可以在 `main.js` 顶部的 `CONFIG` 对象中轻松修改参数：

```javascript
const CONFIG = {
  URL: "https://gemini.google.com/app",
  // 小窗模式尺寸（宽/高）
  MINI_WIDTH: 420,
  MINI_HEIGHT: 680,
  // 大窗模式尺寸比例（占主屏幕尺寸百分比）
  NORMAL_RATIO: 0.75,
  // 最小限制尺寸
  MIN_WIDTH: 360,
  MIN_HEIGHT: 500,
  // 浏览器 UA 伪装
  UA: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  // 标题栏高度
  TITLEBAR_HEIGHT: 34,
};
```

---

## 🏗 项目结构

```
gemini-float/
├── .gitignore           # Git 忽略文件（已配置 node_modules 及日志忽略）
├── main.js              # Electron 主进程：窗口管理、全局快捷键、注册表开机自启、页面注入
├── preload.js           # 预加载脚本：上下文隔离桥接
├── start.cjs            # 启动器：自动检测 7890 端口代理、清除 node runtime 冲突变量并拉起 Electron
├── launch.vbs           # VBS 脚本：支持通过 Windows 任务计划/注册表/双击进行完全无黑框的静默启动
├── create_shortcut.ps1  # 快捷方式生成器：自动写入当前机器绝对路径，完美解决 PATH 变量丢失问题
├── package.json         # 项目依赖与启动脚本
├── icon.png             # 彩色 Gemini 高清 PNG 图标
├── icon.ico             # 转换后支持 Windows 各分辨率的 ICO 图标
└── README.md            # 本文档
```

---

## 📄 许可证

MIT License
