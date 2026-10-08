# Credential storage and recovery

FirstMate stores settings and an EVE refresh token under Electron's user-data directory, in its
`firstmate` subdirectory. Exploration maps, fittings, and Advisor history are separate files.
Provider keys, the MCP bearer key, and EVE refresh tokens are credentials. Never post settings or
token files in an issue, log, chat, or repository.

## Current behavior

- Nonempty new credentials require OS-backed Electron `safeStorage`. The app rejects unavailable
  encryption and Linux `basic_text`/`unknown` backends, without writing a Base64/plaintext fallback.
- Encryption must pass an immediate decrypt/read-back comparison before the stored value is used.
  OS errors exposed in the UI are generic and contain no input values or ciphertext.
- The app writes a same-directory, owner-only temporary file, flushes it, then renames it over the
  destination. A failed write/replacement leaves the original file intact. File mode protections
  depend on the platform; Windows relies on the user-data directory's ACLs.
- An unrelated settings edit preserves opaque secret records. A locked keychain or decryption
  failure cannot silently turn a stored key into an empty replacement.
- EVE login and refresh require secure storage before requesting a token. Failed restoration
  preserves the stored token, including after a network or storage failure. Explicit logout clears
  the stored token. A failure after EVE rotates a token can still require a fresh login.

## Upgrading older installations

Earlier versions stored `b64:` values when OS encryption failed. This is reversible encoding,
not encryption. When FirstMate can use a secure keystore, it validates each legacy field,
encrypts it, verifies the result, and atomically replaces the file. Migration is per file and
idempotent. Other fields are retained. If any credential in that file cannot be read/encrypted or
the write fails, its original records remain unchanged and the app shows a warning.

While secure storage is unavailable, existing records stay on disk but are not used. Legacy
Base64 is never returned to provider/SSO callers unless migration has been saved successfully.
This deliberately favors recoverability over deleting potentially irreplaceable credentials.
It also means an unmigrated Base64 record remains weakly protected until recovery succeeds.

1. Unlock the original OS account's keychain/secret store, then restart FirstMate. On Linux, use
   a supported desktop keyring such as Secret Service or KWallet; do not force `basic_text`.
2. If migration still fails, check local disk access/space and the warning. Keep any recovery copy
   private and protected; it may contain reversible credentials. Do not upload it for support.
3. Files copied from another OS account/machine may not decrypt with this account's keystore.
   Restore access to the original environment or re-enter credentials/re-authenticate deliberately.
4. If old files or backups may have been exposed, rotate the affected keys with their providers
   and reauthorize EVE as appropriate. Re-encrypting local bytes does not revoke prior copies,
   remove backups, or prove that credentials were never accessed.

## Protection limits and acceptance checks

Electron's OS protection has different semantics on each platform. Windows DPAPI does not isolate
credentials from every application running as the same signed-in user. Local encryption also does
not encrypt maps, notes, or Advisor history. Read the upstream
[Electron safeStorage security semantics](https://www.electronjs.org/docs/latest/api/safe-storage).

Tests use synthetic credentials, mocked keystore calls, and temporary directories. They exercise
unavailable/insecure backends, migration, opaque-value preservation, invalid records, interrupted
writes, and sign-in persistence failures. They do not establish real Windows DPAPI, macOS Keychain,
Linux desktop keyring, installed custom-scheme login, or installer behavior. Validate those on the
intended desktop environment before shipping a new release. Existing unsigned releases do not
receive these fixes until a reviewed new version is built and installed.
