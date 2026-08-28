# WorkMuse

WorkMuse 是一款正在开发的个人 AI 工作助手，目标是帮助用户整理工作上下文、规划任务、沉淀知识，并以 AI 协作方式推进日常工作。

当前版本完成了 Electron 桌面应用基础架构、Windows 安装程序，以及从公开 GitHub Releases 检查、下载并安装更新的完整链路。技术栈包括 Electron、electron-vite、TypeScript、pnpm、electron-builder 和 electron-updater。

## 项目结构

```text
.
├─ .github/workflows/release.yml  # tag 触发三平台构建与发布
├─ src/
│  ├─ main/index.ts               # 窗口、更新器与 IPC
│  ├─ preload/index.ts            # 最小权限桥接
│  └─ renderer/
│     ├─ index.html
│     └─ src/                     # 更新状态界面
├─ electron.vite.config.ts
├─ package.json                   # 脚本与 electron-builder 配置
└─ tsconfig.json
```

## 首次配置

1. GitHub 发布目标配置为 `SHgzg/workmuse-ai`。公开仓库无需在客户端内放 token；Actions 使用自动提供的 `GITHUB_TOKEN` 上传产物。
2. 按需修改 `author`，生产发布前配置应用图标与代码签名。
3. 安装依赖并运行：

```bash
pnpm install
pnpm dev
```

开发模式不会访问 Releases。用 `pnpm dist` 可在本机生成当前平台的安装产物；真正的更新链路应使用已安装的 Release 构建验证。

## 资源理解 Core

Core 使用 TypeScript 管理资产、IPC 和领域协议，使用独立 Python Worker
调度文档、图片、音视频和模型工具。输入会归一化为带页码、文本范围或
时间戳来源的 `workmuse.content.v1`，随后进入本地全文/向量混合索引。

- PDF、DOCX、PPTX、XLSX 和图片具有随 Worker 分发的轻量解析能力。
- Docling、MinerU、Tesseract、FFmpeg 和 Whisper 作为可探测增强工具。
- 兼容模型端点可分别配置语义、视觉、嵌入和转写模型。
- API Key 使用操作系统加密能力保存，不会暴露给渲染进程或第三方 CLI。
- 详细架构和环境变量见 `docs/core-runtime.md`。

## 发布与版本约定

- `package.json.version` 使用 SemVer，例如 `0.1.0`、`0.1.1`、`0.2.0`。
- Git 标签必须是完全对应的 `v<version>`，例如版本 `0.1.1` 对应标签 `v0.1.1`。
- 推送标签后，Actions 在 Windows、macOS、Linux 分别构建并上传安装包及更新元数据（如 `latest.yml`、`latest-mac.yml`）。electron-builder 创建/更新的是 draft Release；确认所有平台资产齐全后，在 GitHub 手动发布该草稿。
- 客户端只会发现比当前版本更高、且已经发布（非 draft）的 Release。不要修改已发布版本的同名资产；每次修复都递增版本。

```bash
pnpm version patch
git push origin main --follow-tags
```

若 `pnpm version` 没有创建 `v` 前缀标签，可明确执行 `git tag v0.1.1 && git push origin v0.1.1`。工作流会拒绝版本与标签不匹配的发布。

## 签名与生产注意事项

- Windows 和 macOS 面向真实用户分发时应配置代码签名；macOS 还应做 notarization。未签名包会触发系统警告，macOS 自动更新通常也需要正确签名。
- GitHub provider 主要适合公开仓库。不要把个人访问令牌硬编码进桌面应用。
- 更新下载完成后，用户点击“重启并安装”时，应用会先停止后台写入，并备份、校验数据库、文件库与设置；备份失败时更新会被取消。
- 持久数据统一位于 Electron `userData` 下的 `core/`、`database/`、`library/` 和 `settings/`，不放入会被安装器替换的程序目录。
- 更新快照保存在 `userData/update-backups/`，包含版本及文件统计清单，默认保留最近 3 份。安装器和卸载器均不会自动删除用户数据。
- 首次发布只建立更新基线；安装该版本后，再发布更高版本才能完整测试更新。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 开发运行 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm build` | 生成 `out/` |
| `pnpm runtime:build` | 构建独立 Core Worker sidecar |
| `pnpm pack` | 生成未安装的应用目录 |
| `pnpm dist` | 生成当前平台安装包；Windows 输出到 `release/*-Setup.exe` |
| `pnpm release` | 构建并发布（主要供 Actions 使用） |
