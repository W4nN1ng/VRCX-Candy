;--------------------------------
; VRCX-Candy installer.
;
; Same shape as Installer\installer.nsi, which is why it reads so much like it: an
; upgrade is the old uninstaller run silently, the whole build\Cef tree goes in, and
; the vrcx:// protocol is registered so in game links still open the app.
;
; Two things differ. It installs beside an upstream VRCX instead of over it, under its
; own program files folder and its own registry keys. And it says out loud that the
; data folder is shared, because that is the one way this install can hurt somebody:
; %APPDATA%\VRCX holds the database, and both builds will open it happily at the same
; time.

!addplugindir "${__FILEDIR__}\..\Installer\Plugins\x86-unicode"

;--------------------------------
;Version

    !include "${__FILEDIR__}\version_define.nsh"

    !define PRODUCT_VERSION ${PRODUCT_VERSION_FROM_FILE}
    !define VERSION ${PRODUCT_VERSION_FROM_FILE}
    !define PRODUCT_NAME "VRCX-Candy"
    !define PRODUCT_EXE "VRCX-Candy.exe"
    !define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VRCX-Candy"

    VIProductVersion "${PRODUCT_VERSION}"
    VIFileVersion "${VERSION}"
    VIAddVersionKey "FileVersion" "${VERSION}"
    VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
    VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
    VIAddVersionKey "LegalCopyright" "Copyright vrcx-team, pypy, natsumi"
    VIAddVersionKey "FileDescription" "Friendship management tool for VRChat"

;--------------------------------
;Include Modern UI

    !include "MUI2.nsh"
    !include "FileFunc.nsh"
    !include "LogicLib.nsh"

;--------------------------------
;General

    SetCompressor /SOLID lzma
    SetCompressorDictSize 16
    Unicode True
    Name "${PRODUCT_NAME}"
    OutFile "${__FILEDIR__}\..\VRCX-Candy-Setup.exe"
    InstallDir "$PROGRAMFILES64\VRCX-Candy"
    InstallDirRegKey HKLM "Software\VRCX-Candy" "InstallDir"
    RequestExecutionLevel admin
    ShowInstDetails show

;--------------------------------
;Variables

    VAR upgradeInstallation

;--------------------------------
;Interface Settings

    !define MUI_ABORTWARNING

;--------------------------------
;Icons

    !define MUI_ICON "${__FILEDIR__}\..\images\VRCX-Candy.ico"
    !define MUI_UNICON "${__FILEDIR__}\..\images\VRCX-Candy.ico"

;--------------------------------
;Pages

    !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfUpgrade
    !insertmacro MUI_PAGE_LICENSE "${__FILEDIR__}\..\LICENSE"

    !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfUpgrade
    !insertmacro MUI_PAGE_DIRECTORY

    !insertmacro MUI_PAGE_INSTFILES

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "Launch ${PRODUCT_NAME}"
    !define MUI_FINISHPAGE_RUN_FUNCTION launchVRCX

    !define MUI_FINISHPAGE_SHOWREADME
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "Create desktop shortcut"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION createDesktopShortcut

    ; The one thing worth reading before the first launch.
    !define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} keeps its settings and database in the same place the original VRCX does, so your account and history are already there. Do not run the two at the same time - they would be writing to the same database."

    !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfUpgrade
    !insertmacro MUI_PAGE_FINISH

    !insertmacro MUI_UNPAGE_CONFIRM
    !insertmacro MUI_UNPAGE_INSTFILES
    !insertmacro MUI_UNPAGE_FINISH

;--------------------------------
;Languages

    !insertmacro MUI_LANGUAGE "English"

;--------------------------------
;Functions

Function SkipIfUpgrade
    StrCmp $upgradeInstallation 0 noUpgrade
        Abort
    noUpgrade:
FunctionEnd

Function .onInit
    StrCpy $upgradeInstallation 0

    ReadRegStr $R0 HKLM "${UNINSTALL_KEY}" "UninstallString"
    StrCmp $R0 "" notInstalled
        StrCpy $upgradeInstallation 1
    notInstalled:

    ; An upstream VRCX may be sitting on the same database. It does not block the
    ; install, but it has to be closed before either of them is started again.
    nsProcess::_FindProcess "VRCX.exe"
    Pop $R1
    ${If} $R1 = 0
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "The original VRCX is running.$\n$\nBoth builds use the same database, so running them together can corrupt it.$\n$\nClick OK to close it and continue, or Cancel to stop this installer." /SD IDOK IDCANCEL cancel
            nsExec::ExecToStack "taskkill /IM VRCX.exe"
    ${EndIf}

    loop:
    StrCpy $1 "${PRODUCT_EXE}"
    nsProcess::_FindProcess "$1"
    Pop $R1
    ${If} $R1 = 0
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME} is still running.$\n$\nClick `OK` to kill the running process or `Cancel` to cancel this installer." /SD IDOK IDCANCEL cancel
            nsExec::ExecToStack "taskkill /IM ${PRODUCT_EXE}"
    ${Else}
        Goto done
    ${EndIf}
    Sleep 1000
    Goto loop

    cancel:
        Abort
    done:
FunctionEnd

Function .onInstSuccess
    ${If} $upgradeInstallation = 1
        Call launchVRCX
    ${EndIf}
FunctionEnd

Function createDesktopShortcut
    CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_EXE}"
FunctionEnd

Function launchVRCX
    SetOutPath $INSTDIR
    ShellExecAsUser::ShellExecAsUser "" "$INSTDIR\${PRODUCT_EXE}" ""
FunctionEnd

;--------------------------------
;Installer Sections

Section "Install" SecInstall
    StrCmp $upgradeInstallation 0 noUpgrade
        DetailPrint "Uninstall previous version..."
        ExecWait '"$INSTDIR\Uninstall.exe" /S _?=$INSTDIR'
        Delete $INSTDIR\Uninstall.exe
        Goto afterUpgrade
    noUpgrade:

    inetc::get "https://aka.ms/vs/17/release/vc_redist.x64.exe" $TEMP\vcredist_x64.exe
    ExecWait "$TEMP\vcredist_x64.exe /install /quiet /norestart"
    Delete "$TEMP\vcredist_x64.exe"

    afterUpgrade:

    ; The interface is added from build\html and not picked up on the way past, even
    ; though build\Cef\html points at it. Whether NSIS follows a junction while
    ; recursing is not something worth depending on, and getting it wrong would ship an
    ; installer whose program starts with no interface in it.
    SetOutPath "$INSTDIR"
    File /r /x *.log /x *.pdb /x html "${__FILEDIR__}\..\build\Cef\*.*"

    SetOutPath "$INSTDIR\html"
    File /r /x *.log /x *.pdb "${__FILEDIR__}\..\build\html\*.*"

    SetOutPath "$INSTDIR"

    WriteRegStr HKLM "Software\VRCX-Candy" "InstallDir" $INSTDIR
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "VRCX-Candy"
    WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
    WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayArch" "x64"
    WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
    WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$\"$INSTDIR\${PRODUCT_EXE}$\""

    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "${UNINSTALL_KEY}" "EstimatedSize" "$0"

    ${GetParameters} $R2
    ${GetOptions} $R2 /SKIP_SHORTCUT= $3
    StrCmp $3 "true" noShortcut
        CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_EXE}"
        ApplicationID::Set "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "${PRODUCT_NAME}"
    noShortcut:

    ; Registers the same vrcx:// scheme the original uses, so in game links open
    ; whichever of the two installed most recently.
    WriteRegStr HKCU "Software\Classes\vrcx" "" "URL:vrcx"
    WriteRegStr HKCU "Software\Classes\vrcx" "FriendlyTypeName" "${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Classes\vrcx" "URL Protocol" ""
    WriteRegExpandStr HKCU "Software\Classes\vrcx\DefaultIcon" "" "$INSTDIR\${PRODUCT_EXE}"
    WriteRegStr HKCU "Software\Classes\vrcx\shell" "" "open"
    WriteRegStr HKCU "Software\Classes\vrcx\shell\open" "FriendlyAppName" "${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Classes\vrcx\shell\open\command" "" '"$INSTDIR\${PRODUCT_EXE}" /uri="%1" /params="%2 %3 %4"'
SectionEnd

;--------------------------------
;Uninstaller Section

Section "Uninstall"
    StrCpy $1 "${PRODUCT_EXE}"
    nsProcess::_FindProcess "$1"
    Pop $R1
    ${If} $R1 = 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "${PRODUCT_NAME} is still running. Cannot uninstall this software.$\nPlease close it and try again." /SD IDOK
        Abort
    ${EndIf}

    RMDir /r "$INSTDIR"

    DeleteRegKey HKLM "Software\VRCX-Candy"
    DeleteRegKey HKLM "${UNINSTALL_KEY}"
    DeleteRegKey HKCU "Software\Classes\vrcx"

    ${IfNot} ${Silent}
        Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
        Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    ${EndIf}
SectionEnd
