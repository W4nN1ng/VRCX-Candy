<div align="center">

# <img src="images/VRCX-Candy.png" width="72" height="72" alt="VRCX-Candy"> VRCX-Candy

[VRCX](https://github.com/vrcx-team/VRCX) 的个人中文改版。原版有的东西**一个都没删**，在底下多加了几个自己的功能，并且打包成不用装原版也能直接用的独立程序。

[![Release](https://img.shields.io/github/v/release/W4nN1ng/VRCX-Candy?label=release&color=e0559a)](https://github.com/W4nN1ng/VRCX-Candy/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/W4nN1ng/VRCX-Candy/total?color=6451f1&label=downloads)](https://github.com/W4nN1ng/VRCX-Candy/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**[→ 去下载最新版](https://github.com/W4nN1ng/VRCX-Candy/releases/latest)**

</div>

---

## 下载哪个

| 文件 | 说明 |
| --- | --- |
| **VRCX-Candy-Setup.exe** | 安装版。双击安装，开始菜单和桌面会有快捷方式，以后在「添加或删除程序」里卸载。推荐给不常折腾的人。 |
| **VRCX-Candy-\*-portable.zip** | 便携版。解压到任意位置，双击里面的 `VRCX-Candy.exe` 就能用，不用安装。 |

两个是同一个程序，**选一个就行，别两个都装**。

第一次打开会被 Windows 拦一下（这个程序没买数字签名）：在蓝色的「Windows 已保护你的电脑」上点 **「更多信息」→「仍要运行」**。装了 360、火绒之类也可能提示，同样放行即可。

## 你的账号和数据

和原版 VRCX 共用同一个数据文件夹：`%APPDATA%\VRCX`。

以前用过 VRCX 的话，打开这个改版时账号、好友、聊天记录、设置全都还在，不用重新登录，也不用重新设置。

> **不要和原版 VRCX 同时开着。** 两个版本读写的是同一个数据库文件，同时开着有写坏的风险。想换回原版就先关掉这个。开着原版时启动 Candy 会弹提示拦住你，但反过来挡不住，得自己注意。

## 这个改版加了什么

改版自己的功能都收在导航栏最上面的 **Candy** 分组里。左上角「VRCX-Candy」旁边有个问号按钮，点它可以随时看一遍这份清单。

- :memo: **玩家简介历史** —— 好友改个人简介会被记录下来，能回看之前写的是什么，还能新旧两版并排对比。

  <img src="https://github.com/user-attachments/assets/970b2641-01c9-46b7-963a-6644f76335d0" width="720" alt="玩家简介历史">

- :footprints: **好友足迹** —— 看某位好友去过哪：最常去的地图、平时什么时段在线、按天排列的行程时间线。

  <img src="https://github.com/user-attachments/assets/2c6ba416-eb67-491c-8ea7-5f606b2ae533" width="720" alt="好友足迹">

- :traffic_light: **好友状态灯历史** —— 看好友在四种状态灯上各花了多少时间，以及精确到分钟的「什么时候是什么灯」。只统计真正在线的时间，人不在游戏里时改的灯不算。

  <img src="https://github.com/user-attachments/assets/4be4b7c8-6fe9-4a57-b7e4-c0a45004f976" width="720" alt="好友状态灯历史">

- :people_holding_hands: **好友同游** —— 记录你不在场时，好友们凑在一起去了哪些地图，错过的部分也能补看。

  <img src="https://github.com/user-attachments/assets/18c348d2-ac05-426c-9895-f7c501cf1618" width="420" alt="好友同游">

- :rotating_light: **状态自动更换** —— 配规则让 VRCX 自己换状态灯和状态签名：

  - 和指定好友在同一个房间（或同一个地图）时，自动换成指定的灯，并换上这条规则自己的签名；
  - 进入指定地图时，自动换成指定的灯和签名；
  - 几条规则同时命中时，按 **红灯 > 黄灯 > 绿灯 > 蓝灯** 换优先级最高的那条及其签名。红灯的目的是不被打扰，所以它最大；
  - 离开那个房间、离开那位好友、或者关掉游戏之后，会自动换回你原来的状态。默认只撤销本功能自己改的部分，你手动设的状态不会被动。

  原版那个「有人 / 独处时自动换状态」没有删掉，它现在只是参与同一次比较的另一个候选，默认不会盖过你写的规则。

- :framed_picture: **自定义壁纸** —— 把你自己的一张图铺在界面后面，亮度、模糊、裁剪都能调。在「设置 → 界面」里。

  <img src="https://github.com/user-attachments/assets/de367599-5ac6-4bde-bf80-0517f4c6f2af" width="720" alt="自定义壁纸">

- :battery: **节能** —— 窗口不在视野内时停止绘制界面。实测省不了内存（静态页面本来就不怎么重绘），只省一点 GPU，所以别指望它解决占用。

## 这个改版不会做什么

- 不读取、不上传你的任何数据。所有功能都只读本地的 VRCX 数据库，不写、不外传。
- 不会自动加你进任何群组。
- **自动更新是关掉的**。它能装的只有官方版本，装完这个改版就没了；需要更新时回到 [Releases](https://github.com/W4nN1ng/VRCX-Candy/releases) 页面下载。

## 基于什么做的

[VRCX](https://github.com/vrcx-team/VRCX)（MIT 协议），版权归原作者 pypy 及各位贡献者、以及 vrcx-team 所有。

- 原版 README（完整功能清单、截图、多语言版本、如何从源码构建）保留在 [README/README.upstream.en.md](README/README.upstream.en.md)。
- 分支模型：`master` 是官方原版的一条线，不动，作为 rebase 基线；**`my-vrcx` 才是所有改版功能，也是本仓库的默认分支**。
- 想自己打包：`powershell -ExecutionPolicy Bypass -File candy\build.ps1`，一条命令出前端、宿主、便携 zip 和安装包（需要本机有 .NET SDK 和 NSIS，路径与踩过的坑见 [HANDOFF.md](HANDOFF.md)）。

这不是 VRCX 官方版本，是个人改版，与原项目团队无关。

---

VRCX-Candy is not endorsed by VRChat and does not reflect the views or opinions of VRChat or anyone officially involved in producing or managing VRChat properties. VRChat and all associated properties are trademarks or registered trademarks of VRChat Inc. VRChat © VRChat Inc.
