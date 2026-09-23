# VRCX 二开维护说明

> **先读 [维护指南.md](./维护指南.md)** —— 从零讲清楚原理、日常怎么维护、出问题怎么查。
> 这份 README 是速查表。

你自己在用的 VRCX 改版。这份文档说明它是怎么装上去的、官方更新后怎么办、怎么回滚。

## 东西都在哪

| 位置 | 作用 |
| --- | --- |
| `C:\Users\28041\vrcx-fork` | 你的 fork，完整 git 历史（4000+ 提交），所有自定义代码都在这 |
| ↳ 分支 `feature/bio-history` | 简介历史功能，基于官方 v2026.09.16 |
| ↳ 远程 `upstream` | 官方仓库，走 ghfast.top 镜像（这台机直连 github.com 不通） |
| ↳ 远程 `upstream_github` | 官方仓库原始地址，有梯子时用它拉取更可信 |
| `E:\VRCX` | 正式安装的 VRCX，前端在 `E:\VRCX\html` |
| `E:\VRCX\html_backup\` | 每次部署前自动留的前端备份（保留最近 3 份） |
| `E:\VRCX\html_backup_20260923` | 第一次改造前的**官方原版**前端，回滚用 |
| `C:\Users\28041\vrcx-mod` | 维护脚本（故意放在仓库外，rebase 时不会被牵连） |
| `C:\Users\28041\vrcx-mod\patches` | 你这两个 commit 的 .patch 备份，万一 git 玩坏了能用 |

数据库和登录状态在 `C:\Users\28041\AppData\Roaming\VRCX`，脚本从不碰它。

## 怎么跑

这台机器的 PowerShell 执行策略是 `Restricted`，直接跑 `.ps1` 会被拦。所以每个脚本都配了个 `.cmd` 入口，**双击 `vrcx-mod` 文件夹里的 `.cmd` 就行**，或在终端里敲：

```
C:\Users\28041\vrcx-mod\vrcx-check.cmd      只读体检，随时可跑
C:\Users\28041\vrcx-mod\vrcx-sync.cmd       构建 + 部署当前分支
C:\Users\28041\vrcx-mod\vrcx-update.cmd     官方更新后 rebase + 部署
C:\Users\28041\vrcx-mod\vrcx-push.cmd       保存改动并推到 GitHub 备份
C:\Users\28041\vrcx-mod\vrcx-rollback.cmd   回滚前端
```

## 备份在哪

私有仓库 `git@github.com-vrcx:W4nN1ng/VRCX-sweetCandy.git`，三个分支：

| 分支 | 内容 |
| --- | --- |
| `master` | 官方原版代码，未改动，用来对照和 rebase |
| `feature/bio-history` | 官方 + 简介历史功能 |
| `vrcx-mod` | 这个文件夹的全部内容（脚本 + 指南 + patch） |

推送走 SSH 22 端口，**不需要开梯子**。换电脑怎么恢复见《维护指南》第六部分。

参数照 `.ps1` 的用法加在后面，例如 `vrcx-update.cmd -DryRun`、`vrcx-rollback.cmd -Stock`。
（想让自己写的 `.ps1` 也能直接跑，可以 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，我没替你改。）

## 日常：改了代码想看效果

```powershell
cd C:\Users\28041\vrcx-mod
.\sync.ps1
```

它会先确认 VRCX 已退出、版本对得上，然后构建、备份旧前端、部署、验证产物里确实有功能代码。
部署完启动 VRCX 即可。想反悔：`.\rollback.ps1 -Stock` 直接回到官方原版。

改了代码但懒得重新构建：`.\sync.ps1 -SkipBuild`。
只想看现在装的是哪个版本：`.\sync.ps1 -Check`。

## 官方更新了怎么办（重点）

VRCX 的自动更新会下载 `VRCX_Setup.exe` 重装整个目录，**你的前端会被覆盖掉**。所以流程是：

```powershell
cd C:\Users\28041\vrcx-mod

# 平时先探一下有没有新版、会不会冲突（只读，随时可跑）
.\check-update.ps1
.\update.ps1 -DryRun

# 官方更新装完之后，把你的改动搬到新版上
.\update.ps1
```

`update.ps1` 做四件事：拉上游 → 把 `feature/bio-history` rebase 到新版 master → 跑 lint 和构建 → 部署。

**如果 rebase 停在冲突上**（上游也改了你改过的文件），仓库会处于冲突状态，两条路：

```powershell
git -C C:\Users\28041\vrcx-fork status          # 看谁冲突了
# 改完
git -C C:\Users\28041\vrcx-fork add -A
git -C C:\Users\28041\vrcx-fork rebase --continue
```

或者直接放弃这次升级、完全退回原状：

```powershell
git -C C:\Users\28041\vrcx-fork rebase --abort
```

不想手工处理，就跟 Qoder 说「把 vrcx-fork 的 feature/bio-history rebase 到最新上游并修好冲突」。

顺带说明：`sync.ps1` 会拦下「分支版本 ≠ 已安装版本」的部署，就是为了防止你把旧前端装到新宿主上。真要知道自己在做什么，加 `-Force` 可绕过。

## 加新功能

每个功能开一条自己的分支，都从上游拉出来，别叠在简介历史上：

```powershell
cd C:\Users\28041\vrcx-fork
git checkout -b feature/xxx upstream/master
```

这样哪个功能不想要了，直接不要那条分支就行，不会连累别的。
`config.ps1` 里的 `Branch` 改成当前在用的分支名，脚本就跟着它走。

## 环境坏了怎么重建

```powershell
cd C:\Users\28041\vrcx-fork
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = 1   # Electron 二进制从 github releases 下，直连不通
npm ci
```

镜像挂了的话换源：

```powershell
git -C C:\Users\28041\vrcx-fork remote set-url upstream https://gh-proxy.com/https://github.com/vrcx-team/VRCX.git
```

## 现在这个改版做了什么

玩家资料页的简介卡片下面会显示**上一条简介**，标题栏的历史图标点开是完整简介历史，支持逐词红绿对比和全文对比两种看法。

数据其实早就在存（`VRCX.sqlite3` 里的 `feed_bio` 表），只是官方只把它当动态流用，没在资料页暴露。另外官方记录时要求新旧简介都非空，而接口在刷新好友列表时会偶发返回空简介——你库里 176 条记录有 81 条是这种噪声（9 月 17 日 14:08 的 13 秒内 30 个好友同时"清空简介"），所以查询时把任何一侧为空的记录过滤掉了，只剩 28 条真实修改。

限制：只记录好友；只记录 VRCX 运行期间看到的变更；软件关着时别人改简介补不回来。
