# 接手说明（写给下一个 AI）

这份文档假设你完全没看过之前的对话。读完它你就能接着干活。

用户是中文使用者、**非程序员**、VRChat 内容创作者。他要详细解释、要生活化类比；欢迎你在他的需求之外顺手加相关功能，但每做完一步要如实说明"验证了什么、没验证什么"。

---

## 0. 一句话现状

**VRCX-Candy 已经是一个能独立安装运行的程序**（不是"往原版里塞界面文件"那种改法了），源码公开在 GitHub，最新版已作为 Release 发布。用户手上还有一个能用的原版改版部署方式（换 `E:\VRCX\html`）。

**下一个任务：等用户提。** 目前没有未完成的需求。

---

## 1. 你在哪、手上有什么

| 东西 | 位置 |
| --- | --- |
| 代码仓库 | `C:\Users\28041\vrcx-fork`（git，当前分支 `my-vrcx`） |
| 上游官方 | https://github.com/vrcx-team/VRCX —— remote `upstream`（ghfast.top 镜像）、`upstream_github`（直连） |
| **用户的 GitHub（已公开）** | https://github.com/W4nN1ng/VRCX-sweetCandy —— remote `origin`，SSH 别名 `github.com-vrcx`，密钥 `~/.ssh/id_ed25519_github_vrcx` |
| **发行版（下载页）** | https://github.com/W4nN1ng/VRCX-sweetCandy/releases/latest |
| 部署目标（旧方式） | `E:\VRCX\html` —— 原版 CefSharp 宿主 + 我们的前端，换掉 html 即生效 |
| 维护脚本 | `C:\Users\28041\vrcx-mod`（`sync` / `update` / `check-update` / `rollback` / `push`，各配 `.cmd` 入口；`config.ps1` 集中配置） |
| 用户数据 | `C:\Users\28041\AppData\Roaming\VRCX\VRCX.sqlite3`（**只读，任何脚本都不要写它**） |

**分支模型**：`master` = 官方原版一条线不动（rebase 基线）；`my-vrcx` = 所有自定义功能，**一个功能一个 commit**；`vrcx-mod` 分支存维护脚本和文档。部署只从 `my-vrcx`。

> **绝对不要在 GitHub 网页上把任何分支合并进 master**，那会毁掉 rebase 基线。
> 但**改默认分支是可以的**（Settings → 主设置页 → Default branch，不在 Branches 子页）——`master` 的内容不会动。目前默认分支仍是 `master`，所以别人打开仓库首页看到的是原版代码。

---

## 2. 发布状态（2026-09-23）

| 项 | 值 |
| --- | --- |
| 仓库 | 公开（`visibility: public`） |
| Release | tag `v2026.09.16-candy1`，标题 `VRCX-Candy 2026.09.16` |
| 标签指向 | `f1d6ea27`（`my-vrcx` 顶端）—— 已用 GitHub API 核对过 |
| 附件 | `VRCX-Candy-Setup.exe`（196 MB）、`VRCX-Candy-2026.09.16-portable.zip`（268 MB） |
| 桌面上还有 | 上面两个的副本 + `GitHub发布说明.md`（发布用文案）+ 两个**旧的纯界面 zip**（`-r2.zip`、`2026.09.16.zip`，只含 html，别和完整程序搞混） |

**"干净"的含义**：这两个分发包是正式版——没有临时调试开关，弹窗逻辑是修好的那一版。要验可以直接解压 zip 读 `html/assets/plugins-*.js`（zip 能直接读；NSIS 安装包是 LZMA 自解压，本机没有工具能拆，只能靠"同一次构建产出"来推断）。

---

## 3. 已完成的功能（`my-vrcx`，从旧到新）

| commit | 功能 | 关键文件 / 坑 |
| --- | --- | --- |
| `53a45002` | 玩家简介历史 | `feed_bio` 表；资料页卡片 + `BioHistoryDialog`（逐词 diff / 全文） |
| `e5a9a76a` | 空简介噪声过滤 | 接口刷新好友列表时偶发返回空 bio，176 条里 81 条是假的 |
| `f4e7c485` | 好友足迹仪表盘 | `src/shared/utils/friendFootprints.js`（25 单测）；数据源 `feed_gps` |
| `23b9945e` | 好友状态灯 | `friendStatusLights.js`（30 单测）；**动手前必读第 6 节 `feed_status` 两条** |
| `9af63ea4` | 好友同游 | `friendTogether.js`；**扫描线统计人数必须在移除成员之前取快照**，否则事件全消失 |
| `ea702b13` | 自定义壁纸 | `wallpaper.js`；**根因见下面第 5 节** |
| `fe715c65` | 加群弹窗（一次性） | `GroupInviteDialog.vue` + `constants/groupInvite.js` |
| `06649504` | 同游按整组归并 | 三人同场曾被拆成三对，和「只看三人及以上」的筛选自相矛盾 |
| `f997b4f7` | 壁纸显示修复 | 四个独立原因，见第 5 节 |
| `e49e32e4` | 加群判定修复 | 见下面「加群弹窗」一条，**这是外部用户实际踩到的 bug** |
| `de5a3650` | 命名 + 帮助屏 + 新图标 | 侧边栏顶部「VRCX-Candy」+ 问号按钮；`WhatThisBuildAddsDialog.vue`；14 个语言文件 |
| `f1d6ea27` | 独立程序 | `Dotnet/*` 改名 + `candy/` 打包脚本 + 关掉自动更新 |

**加群弹窗的坑（务必记住）**：判定"这人是不是已经在群里"**必须直接查 `groupRequest.getGroup()` 返回的 `membershipStatus`**，不能用 `groupStore.currentUserGroups`。那个 Map 在登录时**先用配置表 `vrcx_currentusergroups_<userId>` 的上次会话缓存填一遍**，之后才发网络请求（`groupCoordinator.js` 里 `setCurrentUserGroupsInit(true)` 在 `getCurrentUserGroups()` 之前）。于是"上次跑 VRCX 时还是成员、之后退了群"的人会被当成成员 → 弹窗被静默吞掉 → 还写下了"问过了"的标记 → 从此永不出现。规则抽在 `src/shared/utils/groupInvite.js`（纯函数 + 单测），配置键已升到 `VRCX_group_invite_seen_v2`。

**约定**：逻辑层（纯函数、DB 查询）有单测；**视图组件没有单测**（仓库里 HotWorlds / InstanceActivity / MutualFriends 等图表页也都没有，这是仓库惯例，不是遗漏）。

---

## 4. 环境与工具链

### 本机（Windows 11，已配好）

| 工具 | 版本 | 位置 |
| --- | --- | --- |
| Node | v24.21.0 | 全局 |
| npm | 11.19.0 | 全局 |
| Python | 3.12.10 | 全局（画图标、打 zip 用） |
| uv | 有 | `uv run --with pillow python xxx.py`，不污染全局环境 |
| .NET SDK | **10.0.401** | `C:\Users\28041\dotnet\`（用户目录，不是系统安装） |
| NSIS | 3.11 便携版 | `C:\Users\28041\nsis\nsis-3.11\makensis.exe` |

### 换一台新机器要装什么

1. **Node 24** + `npm ci`，命令必须带 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，否则 Electron 二进制从 GitHub Releases 下载会失败。
2. **.NET 10 SDK**：下 `dotnet-install.ps1`，跑
   `powershell -File dotnet-install.ps1 -Channel 10.0 -InstallDir <某目录>`。
   仓库里 `Dotnet/Directory.Build.props` 要求显式传 `-p:Platform=x64`，否则报错。
3. **NSIS 3.11 便携版**：SourceForge 下 `nsis-3.11.zip` 解压即用。仓库自带 4 个第三方插件（`Installer/Plugins/x86-unicode`），不用额外装。
4. **Python 3 + Pillow**（只用来画图标和打 zip）。
5. **`C:\Users\28041\vrcx-mod`**（部署脚本，不在这个仓库里）——新机器要么拷过去，要么直接用 `candy/build.ps1` 出安装包。

> **注意**：所有路径都是硬编码的当前用户路径。换机器/换用户名时，`candy/build.ps1` 的两个参数（`-DotnetRoot`、`-MakensisPath`）和 `vrcx-mod/config.ps1` 都要改。

---

## 5. 环境坑（不看会浪费你一小时）

- **github.com 的 HTTPS 被 TLS 层掐断**（curl 28 / 000），但 **SSH 22 端口通**。拉上游用 `upstream`（ghfast.top 镜像）或 `upstream_github` + 代理 `http://127.0.0.1:10090`（香蕉VPN 的系统代理，仅 VPN 开着时存在）。推送走 SSH，不需要梯子。`api.github.com` 是通的，可以直接用它核对仓库/发行版状态。
- **PowerShell 执行策略是 Restricted**，`.ps1` 不能直接跑；用 `powershell -NoProfile -ExecutionPolicy Bypass -File xxx.ps1` 最省事（不用改机器策略，也不用 `.cmd` 包装）。`.ps1` 文件必须存成 **UTF-8 带 BOM**，否则 PS 5.1 按 GBK 解析会把中文截断。
- **`vitest` 在干净 master 上就有 42 个测试文件失败**（Windows/jsdom 环境问题，与代码无关）。判断有没有引入回归要**比对失败文件的集合**，不能看总数。
  `npx vitest run 2>&1 | grep -oE "FAIL +[^ ]+\.(test|spec)\.[jt]s" | sed -E 's/^FAIL +//' | sort -u`
- **提交前必须过**：`npx oxfmt <改过的文件>`、`npm run lint`、`npx vitest run`、`npm run prod`（或 `npx vite build src`）。
  有 3 个文件本来就不符合 oxfmt（`.github/actions/build-electron/action.yaml`、`package.json`、`src-electron/main.js`），**别去"修"它们**。
- **部署（旧方式）**：关掉 VRCX（含托盘）→ `vrcx-sync.cmd`。官方更新会重装整个 `E:\VRCX` 并覆盖 html，之后跑 `update.ps1`（rebase 到新版上游 + 体检 + 部署）。
- PowerShell 里函数名不能叫 `Git`（和 `git` 命令大小写不敏感冲突，会无限递归）；git 往 stderr 写的正常提示会被 `$ErrorActionPreference='Stop'` 当异常，helper 里要临时降级。
- **Git Bash 会把 `/V4` 这类参数当成路径**（`C:/Program Files/Git/V4`）。调 NSIS 加详细输出时要用 `MSYS_NO_PATHCONV=1`。
- **`grep` 关键词要挑准**：验证产物里有没有某段代码时，别用 `grep -c "forced"` 这种词（CSS 的 `forced-colors` 会误命中）。用日志模板这种唯一字符串。

---

## 6. 数据口径（sqlite 只读）

表前缀 = userId 去掉 `-` 和 `_`，例如 `usr292d12f57f2949a3b4da853ce0183d3c_feed_gps`。

- `feed_gps`：每行是一次换位置事件。`time` 列是"距上次位置变更的毫秒数"，**同图换房时会重置**，所以只是下限；算停留时长要用相邻两行的时间差，间隔超过 12 小时视为 VRCX 没在跑、丢弃不计。
- `feed_status`：`status` / `previous_status` + `status_description` / `previous_status_description`。四种状态：`active`（绿 #2ed319）、`join me`（蓝 #00b8ff）、`ask me`（黄 #e97c03）、`busy`（红 #c80928）。颜色变量在 `src/styles/globals.css`，class 映射在 `src/shared/utils/user.js` 的 `statusClass()`。三个坑：
  - **`status == previous_status` 的行不是重复，别当噪声过滤掉。** 实测 796 条里 169 条是"灯没变、但灯上挂的自定义文案变了"；两边都真没变的行数是 **0**。按直觉写会静默丢掉 21% 的真实事件。这类行要单独当"文案改动"展示，且**不能中断当前灯的区间**。
  - 只有**换灯**时才产生行，一直不换灯就没有记录。所以"某段时间挂的什么灯"必然有未知区段，这是数据源边界，不是 bug；界面上要如实标注，别硬推。
  - `previous_status` 描述的是**本条之前那段**，且能回溯到本次在线会话的开头。所以"会话里第一条变化"的 `previous_status` 是唯一可以安全回填的推断（实测 62 个样本 98% 正确）。**别做跨会话推算**——实测间隔 <1 小时时灯只有 8% 相同，间隔 ≥1 小时才 90%。
- `feed_bio`：`bio` / `previous_bio`，约 46% 是接口噪声。
- `friend_log_history`：`type` 为 `DisplayName` / `TrustLevel`，带 previous 值。
- `feed_online_offline`：上下线事件。**会重复写**（实测 205 组相邻同类型行），且**滞后于状态变化**（796 条状态变化里 121 条落在"它以为离线"的窗口内）。结论：状态变化本身就是"人在线"的证据，建模时用它反过来开在线窗口，并合并相邻同状态区间。
- **共同前提**：所有表只记录 VRCX 运行期间、且只记录好友。任何"完整历史"的说法都不成立。

---

## 7. 打包成独立程序（`candy/`）

用户要的是**脱离原版 VRCX 也能装能跑**的一整套：`.exe` 安装包 + 解压即用的 zip。

```
powershell -ExecutionPolicy Bypass -File candy\build.ps1
```

依次跑：`npm run prod`（前端 + licenses）→ `dotnet build Dotnet/VRCX-Cef.csproj --self-contained`（宿主）→ `candy\make-portable.py`（便携 zip）→ `candy\installer.nsi`（安装包），最后把两个产物复制到桌面。加 `-SkipFrontend` 可跳过前端。**全程约 12 分钟**（NSIS 的 solid LZMA 就要 5-10 分钟，别以为卡死了）。

| 文件 | 作用 |
| --- | --- |
| `candy/build.ps1` | 一条命令跑完四个步骤 |
| `candy/installer.nsi` | NSIS 安装脚本（装到 `$PROGRAMFILES64\VRCX-Candy`，注册 `vrcx://`，附 vc_redist） |
| `candy/make-portable.py` | 打便携 zip（用 Python 的 `zipfile`，理由见下） |
| `candy/make-icon.py` | 画图标（`uv run --with pillow python candy/make-icon.py`） |
| `candy/portable-readme.txt` | 便携包里附的 `使用说明.txt` |

### 踩过的坑（每个都会静默出错）

- **改 `AssemblyName` 会让写死的进程名失效。** `StartupArgs.cs` 里 `Process.GetProcessesByName("VRCX")` 是防重复启动用的；改名成 `VRCX-Candy` 之后它认不出自己的第二个实例，**却仍然认得出原版 VRCX**（于是"开着原版再开 Candy"会静默退出，用户只觉得点不开）。现在两个名字都查，且拦住的是原版时弹框说明。
- **`python` 的 `os.walk` 不跟进 junction。** `build\Cef\html` 是指向 `build\html` 的 junction，直接遍历 `build\Cef` 打出来的包**里面没有界面**。`make-portable.py` 从 `build\html` 单独加进去；`installer.nsi` 用 `/x html` 排掉 junction，再 `SetOutPath "$INSTDIR\html"` 显式加一次。
- **`!include` / `File` 的相对路径依赖 `${__FILEDIR__}`**，而它取决于你把脚本路径怎么传给 makensis。**必须传绝对路径**，否则 NSIS 会先 `Changing directory` 再拼出 `candy\candy\...` 这种错路径。
- **别用 PowerShell 的 `Compress-Archive`**，它写非 ASCII 文件名时不带 UTF-8 标志位，包里的 `使用说明.txt` 会变乱码。用 Python 的 `zipfile`。
- **`version_define.nsh` 不能带 BOM**，NSIS 会把 BOM 读进版本号。`build.ps1` 用 `Encoding::ASCII` 写它。
- **`--config="C:\path\"` 结尾带反斜杠的引号会被 Windows 吞掉**，程序拿到非法路径后在 `Directory.CreateDirectory` 抛异常，弹出 "crashed, open Discord for support?" 的框（而且此时 `Version` 还没赋值，标题会是空的）。冒烟测试传参别带尾部反斜杠。
- **冒烟测试必须用 `--config=<空目录>` 隔离数据**，绝对不能碰 `%APPDATA%\VRCX`——那是用户真实数据库。启动后窗口标题应该是 `VRCX-Candy 2026.09.16`。
- `dotnet build` 的增量编译有时只花 2 秒，**别据此以为没编译**；要确认就 `grep` 产物字符串（.NET 的字符串是 UTF-16，用 Python 按 `utf-16-le` 编码找）。

### 两个刻意的设计决定（不要"顺手改回去"）

- **数据目录和原版共用** `%APPDATA%\VRCX`（用户选的）。所以两边不能同时开。Candy 这侧会拦住并提示；但**原版那侧挡不住**（它查的进程名还是 `VRCX`），文案里必须写明。
- **上游自动更新已关掉**（前端 `noUpdater = true` + 宿主注释掉 `Update.Check()`）。它能装的只有官方版本，装完这个改版就没了；而且它读的是共用目录里的 `update.exe`，官方版留下的会被 Candy 执行。

### 图标

`images/VRCX-Candy.{ico,png}` + `VRCX-Candy_notify.{ico,png}`，由 `candy/make-icon.py` 生成（`uv run --with pillow python candy/make-icon.py`）。
**黑白配色、原版的对话框外形、中间一个粗体几何「C」**。用户否掉过两版：粉紫渐变气泡、气泡里放棒棒糖/糖块。C 是**两个圆加一个扇形缺口**画的，不是字体——原版的 X 本身就是几何图形，用真字体会不搭，也省掉字体依赖。改动图标后**必须重跑 `candy/build.ps1`**，因为：exe 图标、托盘图标、通知图标都要重新拷进 `build/Cef`；而且前端把 `images/VRCX-Candy.png` **内联成 base64 塞进 JS**（`src/vite.config.js` 的 `assetsInlineLimit` 是 40 KB），所以前端也得重编。

---

## 8. 下一个任务 / 待办

**用户目前没有提出新需求。** 以下是已经跟他确认过、但还没做的可选项，等他决定：

1. **改 GitHub 默认分支**为 `my-vrcx`（现在还是 `master`，所以仓库首页显示的是原版代码）。路径：Settings → **主设置页**（不是 Branches 子页）→ Default branch → 点 `master` 右边的 ⇄ → 选 `my-vrcx` → Update → 再点 `I understand, update the default branch` 确认。**这不是合并，master 内容不动，rebase 基线安全。**
2. **给 `README.md` 加一段改版说明**。代价：上游偶尔改 README，以后 rebase 可能冲突一次。
3. **`VRCX_group_invite_seen`（旧键）清理**：旧键还留在用户配置里，没人读它，可以不管。

### 加新图表页要在 7 个文件里注册

漏一个就出问题（用 `grep -rn "charts-hot-worlds" src/` 逐条对，最省事）：`plugins/router.js`、`shared/constants/ui.js`、`nav-menu/navLayoutDefaults.js`、`nav-menu/navMenuUtils.js` 的 `chartsKeys`（有 `every(key => definitionMap.has(key))` 的门槛，漏了**整个 charts 文件夹都不显示**）、`shared/constants/dashboard.js`、`stores/settings/appearance.js`、`Dashboard/components/panelRegistry.js`，外加 `nav-menu/__tests__/navMenuUtils.test.js` 里的 fixture 和期望数组。

### 加新功能的模式

`src/shared/utils/` 下写纯函数聚合层（带单测）→ `src/services/database/feed.js` 加按 userId 的查询 → `src/views/Charts/components/` 加页面 → 注册路由/导航 → 本地化用脚本插 14 个语言文件（zh-CN/zh-TW/ja 手写翻译，其余落英文）。

---

## 9. 干活的习惯

- **一个功能一个 commit**，message 写"为什么"而不是"改了哪个文件"。仓库既有的提交都带 `Co-Authored-By: Claude <noreply@anthropic.com>` 尾注，保持一致。
- **动手写代码之前，先拿真实数据库验一遍你的假设。** 好友状态灯那一轮，两个核心假设（"灯没变就是重复行"、"没记录的时间可以按上一个灯推算"）**都是错的**，查了库才发现。查库很便宜：
  `node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('C:/Users/28041/AppData/Roaming/VRCX/VRCX.sqlite3',{readOnly:true}); console.log(db.prepare('...').all())"`
  机器上没装 sqlite3 命令行，但 Node 24 自带 `node:sqlite`。**只读，永远别写它。**
- **设计里凡是"猜"出来的部分，在界面上标出来并给开关**，别让用户以为那是观测值。
- **临时调试开关用完立刻撤**，别提交。正确做法：改完→构建→让用户看→`git checkout -- <文件>` 还原→重新构建部署。撤掉后要**用唯一字符串验证产物**（比如日志模板 `[VRCX-Candy] group invite: ${r} (seen ${e})` 就是正式版，带 `, forced` 的就是调试版）。
- 改完按第 5 节验证，`vrcx-sync.cmd` 部署，**提交和推送都要等用户明确说**。
- 部署前确认 VRCX 已关；部署后看 `AppData\Roaming\VRCX\logs\` 最新日志有没有 JS 报错。
- 用户看不懂技术细节时，用生活化类比解释（账本/书签/存档点这类），并且主动说明"哪些做不到、为什么"。**报结果要分清"我验证过的"和"我推断的"**——用户会照着你的话去跟别人说。
