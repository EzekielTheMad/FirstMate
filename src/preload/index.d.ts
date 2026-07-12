import type { FirstMateApi } from '@shared/types'

declare global {
  interface Window {
    firstmate: FirstMateApi
  }
}

export {}
