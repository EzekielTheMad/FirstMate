; Remove any previously-installed FirstMate before installing this version.
; electron-builder already replaces a same-scope per-user install; this also
; clears a legacy per-machine install (older builds landed in Program Files).
!macro customInit
  ClearErrors
  ReadRegStr $0 HKLM "${UNINSTALL_APP_KEY}" "QuietUninstallString"
  ${ifNot} $0 == ""
    DetailPrint "Removing a previous FirstMate installation (per-machine)..."
    ExecWait '$0'
  ${endif}
!macroend
