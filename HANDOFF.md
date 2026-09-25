# 接手说明（写给下一个 AI）

这份文档假设你完全没看过之前的对话。读完它你就能接着干活。

用户是中文使用者、**非程序员**、VRChat 内容创作者。他要详细解释、要生活化类比；欢迎你在他的需求之外顺手加相关功能，但每做完一步要如实说明"验证了什么、没验证什么"。

---

## 0. 一句话现状

**VRCX-Candy 已经是一个能独立安装运行的程序**（不是"往原版里塞界面文件"那种改法了），源码公开在 GitHub，最新版已作为 Release 发布。用户日常跑的是**安装版 `E:\VRCX-Candy`**，改版部署方式是换 `E:\VRCX\html`（旧路，仍在机器上）。

**内存/显存优化这条线用户已经明确废止**（α 分支、探针沙箱、测量脚本全部删除，别再去做）。**下一个任务：等用户提。**

---

## 1. 你在哪、手上有什么

| 东西 | 位置 |
| --- | --- |
| 代码仓库 | `C:\Users\28041\vrcx-fork`（git，当前分支 `my-vrcx`） |
| 上游官方 | https://github.com/vrcx-team/VRCX —— remote `upstream`（ghfast.top 镜像）、`upstream_github`（直连） |
| **用户的 GitHub（已公开）** | https://github.com/W4nN1ng/VRCX-Candy —— remote `origin`，SSH 别名 `github.com-vrcx`，密钥 `~/.ssh/id_ed25519_github_vrcx`。**仓库原名 `VRCX-sweetCandy`，已改名**；旧地址 GitHub 暂时重定向，本地 remote 已同步为新地址 |
| **发行版（下载页）** | https://github.com/W4nN1ng/VRCX-Candy/releases/latest |
| **用户实际在跑的程序** | `E:\VRCX-Candy\VRCX-Candy.exe`（安装版）。改前端后要部署到这里才能被看到：`npx vite build src` → 把 `build\html\*` 覆盖进 `E:\VRCX-Candy\html`，然后重启。首次覆盖前的原件备份在 `E:\VRCX-Candy\html.bak-20260924-205802` |
| 部署目标（旧方式） | `E:\VRCX\html` —— 原版 CefSharp 宿主 + 我们的前端，换掉 html 即生效 |
| 维护脚本 | `C:\Users\28041\vrcx-mod`（`sync` / `update` / `check-update` / `rollback` / `push`，各配 `.cmd` 入口；`config.ps1` 集中配置） |
| 用户数据 | `C:\Users\28041\AppData\Roaming\VRCX\VRCX.sqlite3`（**只读，任何脚本都不要写它**） |

**分支模型**：`master` = 官方原版一条线不动（rebase 基线）；`my-vrcx` = 所有自定义功能，**一个功能一个 commit**；`vrcx-mod` 分支存维护脚本和文档。部署只从 `my-vrcx`。

> **绝对不要在 GitHub 网页上把任何分支合并进 master**，那会毁掉 rebase 基线。
> 但**改默认分支是可以的**，而且已经改过了：仓库的默认分支**就是 `my-vrcx`**（Settings → 主设置页 → Default branch，不在 Branches 子页）。`master` 的内容一个字节都没动，rebase 基线安全。所以 `git clone` 下来直接就是带全部功能的代码和新文档，不需要再 `checkout`。

---

## 2. 发布状态（2026-09-25）

| 项 | 值 |
| --- | --- |
| 仓库 | 公开（`visibility: public`） |
| **最新 Release** | tag `v2026.09.16-candy2`，标题 `VRCX-Candy 2026.09.16 (更新版 candy2)` —— `/releases/latest` 已确认指向它 |
| 标签指向 | `b249a8fd`（**注意**：附件后来在 2026-09-25 又换过一次，装的是 `07f82723` 那一轮的代码，tag 本身没动，所以 tag 和包内容已经差两个 commit） |
| 附件 | `VRCX-Candy-Setup.exe`（205,910,411 B，sha256 `73a4a815…`）、`VRCX-Candy-2026.09.16-portable.zip`（280,714,556 B，sha256 `a58913b8…`）；仓库产物、桌面副本、GitHub 回读三方 SHA 一致 |
| 上一个 Release | `v2026.09.16-candy1`（`f1d6ea27`）**原样保留**，附件没动 |
| 发布说明正文 | `candy/release-notes-v2026.09.16-candy2.md`（仓库里留着，方便下次照格式写） |
| 桌面上还有 | 上面两个包的副本 + `GitHub发布说明.md`（candy1 的旧文案）+ 两个**旧的纯界面 zip**（`-r2.zip`、`2026.09.16.zip`，只含 html，别和完整程序搞混） |

**程序内版本号仍是 `2026.09.16`**（用户决定不动 `Version` 文件，因为改它要重跑 12 分钟打包）。所以 candy1 / candy2 在窗口标题和「关于」里看不出区别，只能靠发布页和文件 SHA 区分。

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
| `24dbdaad` + `9cb758b4` | 节能模式（实测收益见下） | `MainForm` 在窗口不可见时 `WasHidden(true)`；`CefService` 关掉后台定时器节流；状态栏迷你图不再每秒重建画布 |
| `f3a82dee` | Candy 分组置顶 | 好友足迹/状态灯/同游从官方「图表」里拆出来单独成组。**导航布局一旦自定义过就整份存库并完全取代默认值**，所以必须靠 `sanitizeLayout` 末尾的后置搬迁，改 `navLayoutDefaults` 对老用户无效 |
| `be093ba3` + `9347b880` | 状态自动更换（按好友 / 按地图） | `shared/utils/autoStatusRules.js` 纯函数 + 28 单测；**没有新增第二个状态写入者**，见第 5 节 |
| `028c1ec6` | 壁纸下开关滑块消失 | `.bg-background` 通用类误伤滑块，见第 5 节 |
| `7c3d32e4` | 足迹/状态灯头像不显示 | 时机问题不是字段问题，见第 5 节 |
| `e09731d8` | 规则不命中时自动还原 | 见第 5 节"自动换状态引擎必须在没有命中时也运行" |
| `726ac41f` | 状态灯不再把离线时间算成挂灯 | 见第 5、6 节 `feed_online_offline` 一条 |
| `07f82723` | 改版页面不再强制收起右侧好友栏 | 见第 5 节 |
| （见面功能） | 常一起玩的好友 | `src/shared/utils/friendMeetings.js`（32 单测）+ `views/Charts/components/FriendMeetings.vue`，数据源 `gamelog_join_leave` × `gamelog_location`，见第 6 节。**顺带修掉 `getSelfLocationSegments` 把停留区间算反的 bug**（同游页受影响） |

### 节能模式的实测结论（重要，别重复踩）

`WasHidden` 确实生效（日志有 `Energy saving: on/off`），但**稳态下几乎不省内存**：可见 100 秒后 851 MB / GPU 125 MB / 渲染 320 MB，最小化 25 秒后 923 MB / 166 MB / 350 MB —— 不降反微升。原因很朴素：**一个静态页面本来就不重绘**，Chromium 只在失效时绘制，所以"停止绘制"这个动作省不到东西。

第一次测出的 743→320 MB 是假象：那次"可见"是在启动后 40 秒测的，程序还在加载，数字被启动开销灌高了。**测内存必须等稳态**，`vrcx-mod/measure-energy.ps1` 现在默认等 100 秒。

结论：想真的把 320 MB 那个渲染进程降下来，只有两条路，都要用户先选：
1. 裁缓存（用户已明确拒绝，因为重开窗口要多加载几秒）。
2. 先测清 320 MB 的构成再定点优化。注意 `AppData\Roaming\VRCX\ImageCache` 是**空的**，VRCX 不用它；图片是模板里 `<img src>` 直连远程地址，解码位图落在 CEF 自己的 `userdata\cache` 里。要拿 JS 堆明细得用 `--debug` 启动（会开 8089 远程调试），但**调试模式会把地址切成 `http://localhost:9000`**，所以必须同时跑 `npm run dev`，测的就不再是生产产物了——这条路要么接受偏差，要么改 `MainForm` 的地址选择逻辑。

### 构建产物的一个坑

`build/Cef` 是 `candy/build.ps1` 用 Release/自包含产出的完整可运行目录。**手工跑 `dotnet build Dotnet/VRCX-Cef.csproj -p:Platform=x64` 会把里面的 exe 换成 Debug 版本**，与目录里其余 Release 原生文件错配，程序启动后只有一个进程、几秒后静默退出——看起来像代码崩了，其实是产物脏了。改完 C# 要么走完整 `candy/build.ps1`，要么 `-c Release` 并且别拿那个目录当可运行产物测。

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
  - **但 `api.github.com` 的 TLS 会间歇失败**（`curl (35) schannel: failed to receive handshake` / `(28) Could not connect`），实测同一个请求第 3 次才通。**所有 API 调用都要包一层重试**（`for i in 1 2 3; do curl ... && break; sleep 3; done`），不然会误判成"没权限"或"文件不存在"。
  - **发 Release 只能走 REST API**：这台机器没装 `gh`、凭据管理器里没有 github 条目、内置浏览器也没登录 GitHub，而 SSH 推不了 Release 和附件。可行做法是让用户建一个 **fine-grained PAT**（只勾 `Contents: Read and write`、只给这一个仓库、过期设 1 天），token 用环境变量传给命令、不写进任何文件。建 Release 用 `POST /repos/{o}/{r}/releases`（`tag_name` 不存在时 GitHub 会自己按 `target_commitish` 打 tag），传附件用 **`uploads.github.com`**（这个域名是通的，`-T 文件` + `Content-Type: application/octet-stream`，205 MB 约 78 秒、281 MB 约 103 秒）。附件回读会带 `digest: sha256:...`，拿它和本地 SHA256 比一次，能证明不是半截文件。用完提醒用户去 `Settings → Developer settings → Fine-grained tokens` 删掉。
- **PowerShell 执行策略是 Restricted**，`.ps1` 不能直接跑；用 `powershell -NoProfile -ExecutionPolicy Bypass -File xxx.ps1` 最省事（不用改机器策略，也不用 `.cmd` 包装）。`.ps1` 文件必须存成 **UTF-8 带 BOM**，否则 PS 5.1 按 GBK 解析会把中文截断。
- **`vitest` 在干净 master 上就有 42 个测试文件失败**（Windows/jsdom 环境问题，与代码无关）。判断有没有引入回归要**比对失败文件的集合**，不能看总数。
  `npx vitest run 2>&1 | grep -oE "FAIL +[^ ]+\.(test|spec)\.[jt]s" | sed -E 's/^FAIL +//' | sort -u`
- **提交前必须过**：`npx oxfmt <改过的文件>`、`npm run lint`、`npx vitest run`、`npm run prod`（或 `npx vite build src`）。
  有 3 个文件本来就不符合 oxfmt（`.github/actions/build-electron/action.yaml`、`package.json`、`src-electron/main.js`），**别去"修"它们**。
- **部署（旧方式）**：关掉 VRCX（含托盘）→ `vrcx-sync.cmd`。官方更新会重装整个 `E:\VRCX` 并覆盖 html，之后跑 `update.ps1`（rebase 到新版上游 + 体检 + 部署）。
- PowerShell 里函数名不能叫 `Git`（和 `git` 命令大小写不敏感冲突，会无限递归）；git 往 stderr 写的正常提示会被 `$ErrorActionPreference='Stop'` 当异常，helper 里要临时降级。
- **Git Bash 会把 `/V4` 这类参数当成路径**（`C:/Program Files/Git/V4`）。调 NSIS 加详细输出时要用 `MSYS_NO_PATHCONV=1`。
- **`grep` 关键词要挑准**：验证产物里有没有某段代码时，别用 `grep -c "forced"` 这种词（CSS 的 `forced-colors` 会误命中）。用日志模板这种唯一字符串。

- **自动换状态引擎必须在"没有命中"时也运行。** 它原先一遇到游戏关闭 / 位置为空就直接 return，结果规则把状态改成红灯后，用户退出游戏状态就永远停在红灯上。现在 `inRoom` 只用来决定"能不能评估规则"，评估不出结果时仍要走恢复分支（`applyAutoStatusFallback`）。恢复有三种模式：`restore`（只撤销本功能自己的改动，需要 baseline）、`fixed`（没命中就固定成指定灯，会覆盖手动设置）、`off`。baseline 在**第一次由规则触发改动之前**捕获并存进 config（重启也不丢），恢复成功后立刻清除，且有 7 天有效期——超过就当没有记录，不会几周后把一个老状态拽回来。
- **旧版「有人/独处」的改动不捕获 baseline、也不被恢复逻辑接管。** 那是上游的功能，一直就是无记录地直接写状态；把它纳入"可撤销"会让它的用户意外。规则引擎只是把它的结果当成一个候选参与裁决。
- **`gameCoordinator.js` 在游戏运行状态变化时无条件调用 `runLastLocationResetFlow()`**，所以退出游戏后 `lastLocation.location` 会变成空串。恢复逻辑正是依赖这一点来判断"已经不在房间里"。

### 2026-09-24 这一轮新踩的坑（都付出了代价，务必先看）

- **`npm run lint` 抓不到未声明变量。** oxlint 默认**不启用 `no-undef`**，所以"lint 0 错误"对这类 bug 完全无效。写 coordinator / store 这种接线代码时，额外跑一次 `npx oxlint -D no-undef <改过的文件>`。本次实例：`updateAutoStateChange` 里引用了没声明的 `friendStore`，构建通过、lint 通过、28 个单测全通过，**运行时每 3 秒抛 `ReferenceError`，功能静默失效**——是用户报告"没自动换状态"后翻 `%APPDATA%\VRCX\logs\VRCX*.log` 才看到的。全仓库跑这条规则会有 32 个误报（`document` 等浏览器全局没配 globals），所以只对改动文件跑。
- **改完前端一定要看运行日志**：`cd %APPDATA%\VRCX\logs`，取最新那个 `VRCX*.log` 看尾巴。`VRCX.MainForm - ReferenceError ...` 这种行就是前端在抛异常。
- **状态字段只能有一个写入者。** `updateAutoStateChange`（`userCoordinator.js`）由 `updateLoop` 每 3 秒调用一次，已经在写 `status` + `statusDescription`。而 `userRequest.saveCurrentUser` 是 PUT，`services/request.js` 的去重/合并和 429 处理**只管 GET 和 `/instances/groups`**，完全不限流。再加一个独立引擎 = 两个写入者每隔几秒互相改回来，并拿用户账号无限打接口。做法：所有候选（新规则 + 旧的有人/独处）交给 `decideAutoStatus` 一次裁决，只发一次请求，并带在途标志与最小写入间隔。
- **导航布局：存档完全覆盖默认值。** 键 `VRCX_customNavMenuLayoutList`（存成 `config:vrcx_customnavmenulayoutlist`）。只要用户自定义过，`loadNavMenuConfig` 就直接用存档、`navLayoutDefaults.js` 整个被跳过。加新分组/新页面必须同时改 `navMenuUtils.js` 的 `sanitizeLayout`（`CANDY_KEYS` + 末尾的 `relocateCandyEntries`），否则老用户永远看不到。
- **`navMenuUtils.js` 里重复维护着一份图表 key 清单**，和 `ui.js` 不一致会触发 `every(key => definitionMap.has(key))` 判断失败，**整个图表文件夹静默消失**（不是少一项，是全没）。两处必须同步改。
- **Tailwind v4 的 `dark:` 包在 `:where()` 里，不贡献优先级。** 所以 `html.has-wallpaper .bg-background`（0,2,1）会压过组件自己的 `dark:data-[state=...]:bg-foreground`。壁纸那条规则用的通用工具类 `.bg-background` 因此把**开关滑块**也刷成半透明底色，滑块直接看不见。给通用类写覆盖规则时要按 `data-slot` 排除控件。
- **VRCX 的好友信息分两批到**：先 id + 名字，完整资料（头像、状态）随后由 `applyUser` 填进 `ctx.ref`。在加载时把 `ref` 拍成快照存进数组，等于永久停在第一批——症状是头像和状态圈同时消失。要**渲染时再查**。
- **两个布尔标记互相推导会死锁**：签名框 `v-if="descriptionEnabled"` + 清洗逻辑 `descriptionEnabled && text.length > 0`，新规则文字本为空 → 开关一拨就被弹回 → 框永远出不来。只留一个真相来源（标记由文字推导）。
- **改语言文件别整份 `JSON.parse` + 序列化**（会把几千行无关行的排版重写，diff 爆炸）。逐行文本插入，并且**写完先 `JSON.parse` 校验、失败就不落盘**——这个守卫实际拦住了两次"漏逗号/漏嵌套层"的错误写入。
- **删 git worktree 前必须先摘 `node_modules` junction**，否则递归删除会顺着链接把主仓库依赖删掉。用 `[IO.Directory]::Delete($path,$false)` 只摘链接，删完核对主仓库条目数。
- **PowerShell 内联命令里别用 `''` 嵌套单引号**（bash 会先吃掉一层，导致 `-Filter "Name = X.exe"` 变成非法 WQL，而且**整条命令解析失败、前面的语句也不会执行**）。写进 `.ps1` 用 `-File` 跑。
- **`cmd | head -N` 会因 SIGPIPE 提前掐死循环**（清理旧构建产物时只删了 5 个就停了）。要统计就先写文件再截断显示。
- **"离线窗口里收到的状态行"不是在线证据，是网页端改灯。** `friendStatusLights.js` 原先写着 `A status change is proof of being online` → `online = true`，把一个已关闭的离线窗口重新打开。实测 815 条 `feed_status` 行里 **82 条（10.1%）落在离线窗口内**，而且**不是滞后**：只有 3.9% 在离线后 2 分钟内，5.3% 在 5 分钟内，10.5% 在 30 分钟内，**中位数 774 分钟（12.9 小时）**。VRChat 允许不开游戏、在官网/仪表盘改灯，这些行是真的但描述的是"人不在游戏里"。后果：某好友 09-19 15:49 下线，16:16 网页改红灯，页面报"最长一次请勿打扰挂了 4 天 22 小时"。修法：`buildStatusIntervals` 里加 `loggedOff` 标记（Offline 事件置真、Online 事件置假），落在离线窗口内的 `feed_status` 事件整条丢弃。**保留的降级行为**：`loggedOff` 初值是假，所以 presence 还没开口（没见过 Offline 行）时状态行照旧生效——否则 presence 表起点晚于 status 表的用户，整段历史会直接归零。修完该好友 30 天口径：busy 从 4 天 22 小时降到 1 分钟，观察到的总时长 4h23。
- **判断有没有引入测试回归要比对失败文件集合，不看总数**（见上）：本次全量 `npx vitest run` 是 40 个文件失败 / 166 条用例，全部是 `useChartsStore` 之类的**陈旧 mock** 和上游快照问题，`friendStatusLights.test.js` 32 条全绿。

### 2026-09-25 这一轮

- **改版页面不要藏右侧好友栏。** 我原先把 `charts-friend-footprints`、`charts-friend-status-lights`、`charts-friend-together`、`candy-auto-status` 四个 key 加进了 `appearance.js` 的 `isSideBarTabShow` 黑名单，理由是"页面宽、被挤会换行"。实际代价更大：`MainLayout.vue` 里有个 `watch(isSideBarTabShow)`，一进这些路由就无条件 `asidePanelRef.collapse()`，用户每次打开都要手动把好友列表拉出来。**已经把这四个撤掉**，现在黑名单和上游一致（只有 `friends-locations`、`friend-list`、`charts-instance`、`charts-mutual`、`charts-hot-worlds`）。右侧栏的展开/收起状态本来就由 `ResizablePanelGroup` 的 `auto-save-id="vrcx-main-layout-right-sidebar"` 存进 localStorage，撤掉强制折叠之后"用户上次是开着的"会自然保留。
- **未解决 / 未验证**：用户报告"手动拉出来以后，最小化窗口几分钟，好友列表又缩回去了"。前端没有任何 `visibilitychange` 或 resize 折叠逻辑，宿主那边的节能只调 `WasHidden()`、不改控件尺寸，所以最可能是 splitter 在窗口最小化期间按 0 宽容器重算、把 aside 算成 0 并被 auto-save 存下来。**这条只是推断，没实测。** 要验的话：用 `--debug` 启动，在最小化前后各读一次 `localStorage['vrcx-main-layout-right-sidebar']`。撤掉强制折叠之后这条路径不再是这些页面独有的，如果还复现，就说明和路由无关。
- **`MainLayout.test.js` 里那两条好友栏测试是跑不起来的**（`SyntaxError: Need to install with app.use function`，vue-i18n 在挂载那一堆对话框时炸），属于基线失败。也就是说**好友栏折叠行为没有任何在跑的保护**，改 `isSideBarTabShow` 或 `MainLayout.vue` 的 watcher 时没有测试会拦住你。

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
- `feed_online_offline`：上下线事件。**会重复写**（实测 205 组相邻同类型行），所以要合并相邻同状态区间。
  - **在线与否只能由它决定**，`feed_status` 不能反过来证明人在线。见下面第 5 节"离线窗口内的状态行"。
- **`gamelog_location`（无表前缀，全局表）记的是"你自己"去过哪些房间**，`feed_gps` 只有好友。字段 `created_at, location, world_id, world_name, time, group_name`。
  - **`created_at` 是"进入"时间，`time` 是"待了多久"**，所以一次停留是 `[created_at, created_at + time]`。实测 560 行里 410 行符合这个读法、**0 行**符合"created_at 是离开时间"的反读法。`time` 是离开时才由 `updateGamelogLocationTimeToDatabase` 补写进去的，所以**最新那一行的 `time` 永远是 0**（就是你现在正待着的地方）——按"当前时间"封顶 12 小时处理，别当成长度为 0 丢掉。
  - 反着读会把每段停留整体前移自己的长度，"我和谁在同一个房间"从 413 次掉到 93 次。这个错曾经就在 `getSelfLocationSegments` 里（`9af63ea4` 引入，好友同游页用它判断"我在不在场"），2026-09-25 修掉。
- **`gamelog_join_leave`（全局表）是"谁在哪个实例进出的"**：`created_at, type, location, user_id, display_name, time`，`type` 只有 `OnPlayerJoined` / `OnPlayerLeft`，成对出现（实测 5164 / 5158）。
  - 这是唯一能精确到**同一个实例**判断"两个人在一起"的来源，比用 `feed_gps` 推好友停留区间更准（实测：本表 413 次同处一室 / 28 位好友 / 213 小时，`feed_gps` 只能看到 291 次，其中 6 次还是本表没看到的）。
  - **它包含公共房间里所有陌生人**，不是只有好友（2896 个不同 user_id vs 64 位好友）。所以查询里必须 `user_id IN (SELECT user_id FROM {前缀}_friend_log_current)`，实测把行数从 10324 压到 911（少 91%）。`friend_log_current` 就是好友名单（行数 = 好友数）。
  - 只有 GameLog 开着才有数据；且只覆盖"你进过的实例"，正好是判断见面需要的范围。
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

1. ~~**给 `README.md` 加一段改版说明。**~~ **已做完**：仓库首页现在是 VRCX-Candy 自己的中文说明（下载选择、数据共用、Candy 功能清单带截图、不做的事、上游署名），上游那份原封不动搬到了 `README/README.upstream.en.md`，只在开头加了两行"这是上游文档"的提示，并把 9 个语言链接和 `CONTRIBUTING.md` 的相对路径改到新位置。
   - **rebase 时会冲突在这里**：上游偶尔会改 `README.md`，而我们这边它已经不存在了（改名 + 内容不同），git 会报 rename/modify。处理办法：冲突时**保留我们的删除**，把上游新 README 的内容覆盖进 `README/README.upstream.en.md`（注意别把开头那两行提示和改过的相对路径丢掉）。
2. **改仓库 About 简介 + Topics**（网页操作，用户自己做，PAT 没有 Administration 权限所以代办不了）。右上角齿轮 → Description 填：`VRCX 的中文改版：好友足迹 / 状态灯历史 / 同游记录 / 自动换状态 / 自定义壁纸，原版功能一个没删`；Website 填 `https://github.com/W4nN1ng/VRCX-Candy/releases/latest`；Topics 加 `vrchat`, `vrcx`, `vrcx-fork`, `vrchat-tool`。
3. **`VRCX_group_invite_seen`（旧键）清理**：旧键还留在用户配置里，没人读它，可以不管。

已经做完、不用再做的：仓库改公开 ✅、默认分支改 `my-vrcx` ✅、发布 Release（candy1、candy2，附件 SHA256 均已核对）✅、仓库首页换成改版自己的说明 ✅。

### 加新图表页要在 8 个文件里注册

漏一个就出问题（用 `grep -rn "charts-hot-worlds" src/` 逐条对，最省事）：`plugins/router.js`、`shared/constants/ui.js`、`nav-menu/navLayoutDefaults.js`、`nav-menu/navMenuUtils.js` 的 `chartsKeys`（有 `every(key => definitionMap.has(key))` 的门槛，漏了**整个 charts 文件夹都不显示**；改版功能现在在 `CANDY_KEYS` 里）、`shared/constants/dashboard.js`、`Dashboard/components/panelRegistry.js`，外加 `nav-menu/__tests__/navMenuUtils.test.js` 里的 fixture 和期望数组。

**`stores/settings/appearance.js` 的 `isSideBarTabShow` 不在名单里——别再往里面加。** 见第 5 节"改版页面不要藏右侧好友栏"。

**只对老用户生效的额外一步**：新 key 必须出现在 `navMenuUtils.js` 的 `CANDY_KEYS` 里，否则它会被自动补漏逻辑甩到菜单最底部而不是进 Candy 文件夹（存档布局优先于默认值，见第 5 节）。

### 加新功能的模式

`src/shared/utils/` 下写纯函数聚合层（带单测）→ `src/services/database/feed.js` 加按 userId 的查询 → `src/views/Charts/components/` 加页面 → 注册路由/导航 → 本地化用脚本插 14 个语言文件（zh-CN/zh-TW/ja 手写翻译，其余落英文）。

**每加一个改版功能，还要在侧边栏那个「这个改版加了什么」弹窗里挂一张卡片**：`src/components/onboarding/WhatThisBuildAddsDialog.vue` 里是一个**硬编码的 `features` 数组**（key + lucide 图标），文字全在 `view.help.features.<key>.{title,description}` 这 14 份语言文件里。只改数组不改语言文件会直接渲染成 key 名。删功能同理，两边都要动。
- 改这 14 份 JSON 的可靠做法：先验证 `JSON.stringify(JSON.parse(raw), null, 4) + '\n' === raw`（**实测 14 份全部成立**，所以可以解析→改→整体序列化，diff 只会命中真正改的那几行），再在写盘前 `JSON.parse` 一遍输出、失败就不写。这条比逐行文本插入省事且不会漏逗号。
- 语言文件之间**本来就不齐**（`en.json` 3258 个 key，`ko.json` 只有 1559 个），这是上游翻译欠账，vue-i18n 会回落英文，别去"补齐"。判断自己有没有改坏，要比对**同一个 key 在 14 份里都在不在**，不要比对总数。

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
