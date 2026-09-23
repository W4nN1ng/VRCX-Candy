# VRCX 二开维护配置 —— 所有脚本都读这个文件
# 改了安装位置或分支名，只动这里。

$script:VrcxMod = @{
    # 你的 fork 仓库
    Repo         = 'C:\Users\28041\vrcx-fork'
    # 部署分支：所有自定义功能都汇在这条线上，一个功能一个 commit。
    # master 保持官方原样不动，它是 rebase 时的对照基线。
    # 加新功能：git checkout -b feature/xxx upstream/master 做完再并回 my-vrcx。
    Branch       = 'my-vrcx'
    # VRCX 安装目录（里面有 Version 文件和 html 前端目录）
    InstallDir   = 'E:\VRCX'
    # 官方更新器下载 VRCX_Setup.exe 后会重装整个目录，html 会被覆盖，
    # 所以每次官方更新后需要重新跑一次 update.ps1 + sync.ps1
    # 保留几份前端备份用于回滚
    KeepBackups  = 3
    # 拉取上游用的镜像。github.com 直连在这台机器上不通，所以走 ghfast.top。
    # 挂了 VPN 时可以用： git fetch upstream_github
    Upstream     = 'upstream'
}
