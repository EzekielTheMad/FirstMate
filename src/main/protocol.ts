import { app } from 'electron'
import { resolve } from 'path'

/** Extract a callback deep-link (eveauth-*://callback?…) from a set of args. */
export function findCallbackUrl(args: string[]): string | undefined {
  return args.find((a) => a.includes('://callback'))
}

/** Register this app as the OS handler for the configured custom scheme. */
export function registerProtocol(scheme: string): void {
  if (!scheme) return
  if (process.defaultApp && process.argv.length >= 2) {
    // Dev: point the OS at the electron binary + this script.
    app.setAsDefaultProtocolClient(scheme, process.execPath, [resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(scheme)
  }
}
