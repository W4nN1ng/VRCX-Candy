# 接手说明（写给下一个 AI）

这份文档假设你完全没看过之前的对话。读完它你就能接着干活。用户是中文使用者、非程序员、VRChat 内容创作者；他要详细解释，并且欢迎你在他提的需求之外顺手加相关功能。

## 1. 你在哪、手上有什么

| 东西 | 位置 |
| --- | --- |
| 代码仓库 | `C:\Users\28041\vrcx-fork`（git，当前分支 `my-vrcx`） |
| 上游官方 | https://github.com/vrcx-team/VRCX —— remote `upstream`（ghfast.top 镜像）、`upstream_github`（直连） |
| 你的 GitHub 私有仓库 | `git@github.com-vrcx:W4nN1ng/VRCX-sweetCandy.git`（SSH 密钥 `~/.ssh/id_ed25519_github_vrcx`，主机别名 `github.com-vrcx`） |
| 部署目标 | `E:\VRCX\html`（CefSharp 版 VRCX，前端就是一堆静态文件，换掉即生效） |
| 维护脚本 | `C:\Users\28041\vrcx-mod`（sync/update/check-update/rollback/push，配 `.cmd` 入口；`config.ps1` 集中配置；`维护指南.md` 是写给用户看的） |
| 用户数据 | `C:\Users\28041\AppData\Roaming\VRCX\VRCX.sqlite3`（只读，脚本从不写它） |

仓库分支模型：`master` = 官方原版一条线不动（rebase 基线）；`my-vrcx` = 所有自定义功能，**一个功能一个 commit**；GitHub 上还有个 `vrcx-mod` 分支存脚本和文档。部署只从 `my-vrcx`。**不要在 GitHub 网页上把任何分支合并进 master**，那会毁掉 rebase 基线。

## 2. 已经完成的功能（my-vrcx 上从旧到新）

1. `53a45002` 玩家简介历史：资料页简介卡片下显示上一条简介 + `BioHistoryDialog` 完整历史（逐词红绿 diff / 全文两种看法）。数据源 `feed_bio` 表。
2. `e5a9a76a` 空简介噪声过滤：VRChat 接口刷新好友列表时偶发返回空 bio，库里 176 条有 81 条是这种假"清空"，读取时过滤掉。
3. `f4e7c485` 好友足迹仪表盘：图表菜单新增"好友足迹"页，左栏选好友，右栏看概览卡 / Top 世界 / 周×24 时段热力 / 社群分布 / 按日分组时间线。数据源 `feed_gps` 表，聚合逻辑在 `src/shared/utils/friendFootprints.js`（纯函数，有 25 个单测）。
4. `23b9945e` 好友状态灯：图表菜单新增"好友状态灯"页，左栏选好友，右栏看概览卡 / 四灯占比 / 按天分组精确到分钟的时间线 / 24 小时灯分布 / 文案改动记录。数据源 `feed_status` + `feed_online_offline`，聚合逻辑在 `src/shared/utils/friendStatusLights.js`（纯函数，有 30 个单测）。资料页也并排加了入口。**动手前务必读第 4 节的 `feed_status` 两条**——这个功能有两个"按直觉写就会算错"的坑。
5. `9af63ea4` 好友同游：图表菜单新增"好友同游"页，记录"我不在场时好友们一起去了哪"。数据源 `feed_gps` + `gamelog_location`，聚合逻辑在 `src/shared/utils/friendTogether.js`。**扫描线统计人数必须在成员被移除之前取快照**——在 `delete` 之后数人数会让每个事件都消失（踩过，见 `findTogetherEvents` 的注释和回归测试）。同场的人按**整组**归并，不要拆成两两组合。
6. `ea702b13` 自定义壁纸：设置 → 界面里选图，可调亮度 / 模糊 / 缩放 / 焦点 / 填充模式，内容区和侧边栏各有不透明度。逻辑在 `src/shared/utils/wallpaper.js`（纯函数 + 单测）。**踩坑记录**：`html.dark` 给根元素设了背景色，于是 `body` 的背景不再上浮到画布、而是当普通块背景绘制，会盖住 `z-index:-1` 的壁纸层——所以 `html.has-wallpaper body { background: transparent; }` 这句不能删。另外改 CSS 时注意 `globals.css` 里壁纸那段的**书写顺序**（它和 `html.dark .x-container` 同优先级，靠后覆盖）。
7. `fe715c65` 加群弹窗：登录后一次性询问是否加入作者的群组。`src/components/onboarding/GroupInviteDialog.vue` + `src/shared/constants/groupInvite.js`。**判定成员身份必须直接查 `groupRequest.getGroup()` 的 `membershipStatus`，不能用 `groupStore.currentUserGroups`**——那个 Map 在登录时先用配置表 `vrcx_currentusergroups_<userId>` 的**上次会话缓存**填一遍，之后才发网络请求，于是"上次还是成员、这次已经退群"的人会被当成成员，弹窗被静默吞掉且从此不再出现。规则抽在 `src/shared/utils/groupInvite.js`（纯函数 + 单测）。

约定：逻辑层（纯函数、DB 查询）有单测；**视图组件没有单测**（仓库里 HotWorlds/InstanceActivity/MutualFriends 等图表页也都没有，这是仓库惯例，不是遗漏）。

## 3. 环境坑（不看会浪费你一小时）

- **github.com 的 HTTPS 被 TLS 层掐断**（curl 28 / 000），但 **SSH 22 端口通**。拉代码用 `upstream`（镜像）或 `upstream_github` + 代理 `http://127.0.0.1:10090`（香蕉VPN 的系统代理，仅 VPN 开着时存在）。推送走 SSH，不需要梯子。
- `npm ci` 必须带 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，否则 Electron 二进制从 github releases 下载失败。
- PowerShell 执行策略是 `Restricted`，`.ps1` 不能直接跑；用 `vrcx-mod` 里的 `.cmd`。`.ps1` 文件必须存成 **UTF-8 带 BOM**，否则 PS 5.1 按 GBK 解析会把中文截断。
- `vitest` 在**干净 master 上就有约 42 个测试文件失败**（Windows/jsdom 环境问题，与代码无关）。判断你的改动有没有引入回归，要**比对失败测试的集合**，不能看失败总数。基线可以 `git stash` 后跑一遍拿到。
- 提交前必须过：`npx oxfmt <改过的文件>`、`npm run lint`、`npx vitest run <相关测试>`、`npx vite build src`。有 3 个文件本来就不符合 oxfmt（`.github/actions/build-electron/action.yaml`、`package.json`、`src-electron/main.js`），别去"修"它们。
- 部署流程：关掉 VRCX（含托盘）→ `vrcx-sync.cmd`。**官方更新会重装整个 `E:\VRCX` 并覆盖 html**，之后要跑 `update.ps1`（rebase 到新版上游 + 体检 + 部署）。
- PowerShell 里函数名不能叫 `Git`（和 `git` 命令大小写不敏感冲突，会无限递归）；git 往 stderr 写的正常提示会被 `$ErrorActionPreference='Stop'` 当异常，helper 里要临时降级。
- **`.ps1` 用 `powershell -ExecutionPolicy Bypass -File xxx.ps1` 跑最省事**（不用改机器策略，也不用 .cmd 包装）。`candy/build.ps1` 就是这么调的。本机原先没有 .NET SDK，现在装在 `C:\Users\28041\dotnet`（见第 6 节）。

## 4. 数据口径（sqlite 只读）

表前缀 = userId 去掉 `-` 和 `_`，例如 `usr292d12f57f2949a3b4da853ce0183d3c_feed_gps`。

- `feed_gps`：每行是一次换位置事件。`time` 列是"距上次位置变更的毫秒数"，**同图换房时会重置**，所以只是下限；算停留时长要用相邻两行的时间差，间隔超过 12 小时视为 VRCX 没在跑、丢弃不计。
- `feed_status`：`status` / `previous_status` + `status_description` / `previous_status_description`。状态值四种：`active`（绿 #2ed319）、`join me`（蓝 #00b8ff）、`ask me`（黄 #e97c03）、`busy`（红 #c80928）。颜色变量在 `src/styles/globals.css` 的 `--status-online/joinme/askme/busy`，class 映射在 `src/shared/utils/user.js` 的 `statusClass()`。两个坑：
  - **`status == previous_status` 的行不是重复，别当噪声过滤掉。** 实测 796 条里 169 条是"灯没变、但灯上挂的自定义文案变了"（VRChat 允许给灯配一句话）；两边都真的没变的行数是 **0**。按直觉写会静默丢掉 21% 的真实事件。这类行应单独当"文案改动"展示，且**不能中断当前灯的区间**。
  - 只有**换灯**时才产生行，一直不换灯就没有记录。所以"某段时间挂的什么灯"必然存在未知区段，这是数据源边界，不是 bug；界面上要如实标注，别硬推。
  - `previous_status` 描述的是**本条之前那段**的时间，且能一直回溯到本次在线会话的开头（因为下线的转换被 `userEventCoordinator.js` 的过滤条件挡掉了）。所以"会话里第一条变化"的 `previous_status` 是唯一可以安全回填的推断；实测 62 个样本里 98% 正确。**别做跨会话的灯延续推算**——实测两次观测间隔 <1 小时时灯只有 8% 相同（那正是"人在线并且刚换了灯"），间隔 ≥1 小时才 90% 相同。
- `feed_bio`：`bio` / `previous_bio`，约 46% 是接口噪声（见上）。
- `friend_log_history`：`type` 为 `DisplayName` / `TrustLevel`，带 previous 值。
- `feed_online_offline`：上下线事件。**会重复写**（实测 205 组相邻同类型行），且**滞后于状态变化**（796 条状态变化里有 121 条落在"它以为离线"的窗口内）。结论：状态变化本身就是"人在线"的证据，建模时要用它反过来开在线窗口，并且要合并相邻同状态的区间。
- **共同前提**：所有表只记录 VRCX 运行期间、且只记录好友。任何"完整历史"的说法都不成立，界面上要如实标注。

## 5. 下一个任务

**目前没有已提出的新需求，等用户说。** 上一轮的需求（好友状态灯统计）已在 `23b9945e` 完成，见第 2 节第 4 条，不要重做。

下面留的是那一轮的需求原文和当时定下的口径，读一下有助于理解用户的偏好和踩过的坑：

> 1. 统计某个好友四种灯的使用占比（蓝/绿/黄/红各占百分之几），要可视化。
> 2. 记录"什么时候是什么灯"，精确到分钟（例：12 月 6 日 6 点是蓝灯，13 点切黄灯，21 点回蓝灯），要可视化。
> 3. 在这两点之上自由加相关功能，让用户更直观地看到好友状态变化。

**最后定下的口径**（用户认可、界面上有写明，改这个功能时别推翻）：

- 主百分比**只统计"确实记录到灯"的时间**；「在线但未知 / 离线 / 无记录」三项单独列出，不掺进分母，免得数字被猜测稀释。
- 另给一个**默认关闭**的「推算」开关，打开才把会话开头那段回填计入，图例标 `≈` 并注明是估计值。
- 区间重建时，**夹在两个真实事件之间的区间无论多长都采信**（灯不变本来就不产生行）；**只有从最后一个事件到"现在"的那段**在超过 12 小时时才丢弃——那一段没有第二个见证者。

加新功能时沿用足迹那套已验证的模式：`src/shared/utils/` 下写纯函数聚合层（带单测）→ `src/services/database/feed.js` 加按 userId 的查询 → `src/views/Charts/components/` 加页面 → 注册路由/导航 → 本地化用脚本插 14 个语言文件（zh-CN/zh-TW/ja 翻译，其余落英文）。

**新图表页要在 7 个文件里注册，漏一个就出问题**（用 `grep -rn "charts-hot-worlds" src/` 逐条对，这是最省事的办法）：`plugins/router.js`、`shared/constants/ui.js`、`nav-menu/navLayoutDefaults.js`、`nav-menu/navMenuUtils.js` 的 `chartsKeys`（有 `every(key => definitionMap.has(key))` 的门槛，漏了**整个 charts 文件夹都不显示**）、`shared/constants/dashboard.js`、`stores/settings/appearance.js`、`Dashboard/components/panelRegistry.js`，外加 `nav-menu/__tests__/navMenuUtils.test.js` 里的 fixture 和期望数组。

## 6. 打包成独立程序（candy/）

用户要的是**脱离原版 VRCX 也能装能跑**的一整套：`.exe` 安装包 + 解压即用的 zip。脚本都在 `candy/`。

**工具链不在仓库里，是本机装的**（`.NET SDK` 和 `NSIS` 都装在用户目录）：

- .NET 10 SDK：`C:\Users\28041\dotnet\`，用 `dotnet-install.ps1 -Channel 10.0 -InstallDir C:\Users\28041\dotnet` 装的。
- NSIS 3.11 便携版：`C:\Users\28041\nsis\nsis-3.11\makensis.exe`（不用装，解压即用；仓库自带了 `nsisProcess`/`inetc`/`ApplicationID`/`ShellExecAsUser` 四个插件在 `Installer\Plugins\x86-unicode`）。
- Python + Pillow（画图标、打包 zip）：`uv run --with pillow python ...`。

一条命令跑完：

```
powershell -ExecutionPolicy Bypass -File candy\build.ps1
```

它会依次跑 `npm run prod`（前端 + licenses）→ `dotnet build Dotnet/VRCX-Cef.csproj --self-contained`（宿主，会沿用 PreBuild 的 junction 把 `build\html` 接到 `build\Cef\html`）→ `candy\make-portable.py` 出便携 zip → `candy\installer.nsi` 出安装包，最后把两个产物复制到桌面。加 `-SkipFrontend` 可跳过前端。

**踩过的坑（每个都会静默出错，值得记住）**：

- **改 `AssemblyName` 会让写死的进程名失效。** `StartupArgs.cs` 里 `Process.GetProcessesByName("VRCX")` 是防重复启动用的；改名成 `VRCX-Candy` 之后它认不出自己的第二个实例，**却仍然认得出原版 VRCX**。现在两个名字都查，而且当拦住的是原版时弹框说明——否则用户看到的只是"点了没反应"。
- **`python` 的 `os.walk` 不跟进 junction。** `build\Cef\html` 是指向 `build\html` 的 junction，直接遍历 `build\Cef` 打出来的包**里面没有界面**。`make-portable.py` 是从 `build\html` 单独加进去的，`installer.nsi` 里也是一样的写法（`/x html` 排掉 junction，再 `SetOutPath "$INSTDIR\html"` 显式加一次）。
- **别用 PowerShell 的 `Compress-Archive`**，它写非 ASCII 文件名时不带 UTF-8 标志位，包里的 `使用说明.txt` 会变成乱码。用 Python 的 `zipfile`。
- **`version_define.nsh` 不能带 BOM**，NSIS 会把 BOM 读进版本号里。`build.ps1` 用 `Encoding::ASCII` 写它。
- **NSIS 打一个包要 5-10 分钟**（666 MB 数据走 solid LZMA），别以为卡死了。
- **`--config="C:\path\"` 这种结尾带反斜杠的引号会被 Windows 吞掉**，程序拿到非法路径后在 `Directory.CreateDirectory` 抛异常，弹出一个"crashed, open Discord for support?"的框。冒烟测试传参别带尾部反斜杠。
- 冒烟测试要用 `--config=<空目录>` 隔离数据，**绝对不能**让测试实例碰到 `%APPDATA%\VRCX`——那是用户真实数据库。

**数据目录是共用的**（用户选的）：新版和原版都读 `%APPDATA%\VRCX`，所以两边不能同时开。原版 VRCX 认不出 VRCX-Candy（它查的还是 "VRCX"），所以**从原版那一侧启动挡不住**，文档里必须写明。

**上游自动更新已经关掉**（前端 `noUpdater = true` + 宿主注释掉了 `Update.Check()`）：它能装的只有官方版本，装完这个改版就没了。

## 7. 干活的习惯

- 一个功能一个 commit，message 写"为什么"而不是"改了哪个文件"。
- **动手写代码之前，先拿真实数据库验一遍你的假设。** 好友状态灯那一轮，我原本的两个核心假设（"灯没变就是重复行"、"没记录的时间可以按上一个灯推算"）**都是错的**，是查了库才发现：前者会丢掉 21% 的真实事件，后者在短间隔下只有 8% 命中。查库很便宜——`node -e` 里 `require('node:sqlite')` 以 `readOnly: true` 打开 `C:\Users\28041\AppData\Roaming\VRCX\VRCX.sqlite3` 就能查，机器上没装 sqlite3 命令行但 Node 24 自带这个模块。**只读，永远别写它。**
- 设计里凡是"猜"出来的部分，在界面上标出来并给开关，别让用户以为那是观测值。
- 改完按第 3 节那四步验证，再 `vrcx-sync.cmd` 部署、`vrcx-push.cmd` 推 GitHub。
- 部署前确认 VRCX 已关；部署后看 `AppData\Roaming\VRCX\logs\` 最新日志有没有 JS 报错。
- 用户看不懂技术细节时，用生活化类比解释（账本/书签/存档点这类），并且主动说明"哪些做不到、为什么"。
