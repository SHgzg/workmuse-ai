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
- 更新下载完成后，用户可点击“重启并安装”；若不点击，`autoInstallOnAppQuit` 会在退出时安装。
- 首次发布只建立更新基线；安装该版本后，再发布更高版本才能完整测试更新。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 开发运行 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm build` | 生成 `out/` |
| `pnpm pack` | 生成未安装的应用目录 |
| `pnpm dist` | 生成当前平台安装包；Windows 输出到 `release/*-Setup.exe` |
| `pnpm release` | 构建并发布（主要供 Actions 使用） |
