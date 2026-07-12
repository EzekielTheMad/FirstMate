; Remove any previously-installed FirstMate before installing this version.
; electron-builder already replaces a same-scope per-user install; this also
; clears a legacy per-machine install (older builds landed in Program Files).
!macro customInit
  ; UNINSTALL_APP_KEY is only the GUID key name (see app-builder-lib NsisTarget.js);
  ; the actual uninstall entry lives under the standard Uninstall path, exactly as
  ; electron-builder's own multiUser.nsh composes it.
  ClearErrors
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString"
  ${ifNot} $0 == ""
    DetailPrint "Removing a previous FirstMate installation (per-machine)..."
    ExecWait '$0'
  ${endif}
!macroend
