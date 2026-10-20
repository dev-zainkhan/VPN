; Raaz VPN installer (NSIS). Built by .github/workflows/desktop.yml after "wails build":
;   makensis -DVERSION=1.0.N build/windows/installer/raaz.nsi
Unicode true
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define APPNAME "Raaz VPN"
!define EXE "RaazVPN.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\RaazVPN"
!define TUNNELSVC "WireGuardTunnel$$Raaz"

Name "${APPNAME}"
OutFile "..\..\bin\RaazVPN-Setup.exe"
InstallDir "$PROGRAMFILES64\Raaz VPN"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "Raaz VPN ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "Raaz VPN"
VIAddVersionKey "FileDescription" "Raaz VPN installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "(c) 2026 Raaz VPN"

!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open Raaz VPN"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!macro StopRaaz
  ; A running app or tunnel keeps the files in use.
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  nsExec::Exec 'sc.exe stop "${TUNNELSVC}"'
  Sleep 1500
  nsExec::Exec 'sc.exe delete "${TUNNELSVC}"'
  Sleep 500
!macroend

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Raaz VPN needs 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "Install"
  SetShellVarContext all
  !insertmacro StopRaaz
  SetOutPath "$INSTDIR"
  File "..\..\bin\${EXE}"
  File "..\..\bin\wireguard.dll"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Raaz VPN.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$DESKTOP\Raaz VPN.lnk" "$INSTDIR\${EXE}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "Raaz VPN"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Function un.onInit
  SetRegView 64
FunctionEnd

Section "Uninstall"
  SetShellVarContext all
  !insertmacro StopRaaz
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\wireguard.dll"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\Raaz VPN.lnk"
  Delete "$DESKTOP\Raaz VPN.lnk"
  RMDir /r "$COMMONAPPDATA\RaazVPN"
  DeleteRegKey HKLM "${UNINSTKEY}"
SectionEnd
