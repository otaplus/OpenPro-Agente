import type { OpenProApi } from '@shared/types'

declare global {
  interface Window {
    api: OpenProApi
    menu: {
      onNewChat: (cb: () => void) => () => void
      onOpenWorkspace: (cb: () => void) => () => void
    }
    clipboard: {
      write: (text: string) => Promise<void>
      read: () => Promise<string>
    }
  }
}

export {}
