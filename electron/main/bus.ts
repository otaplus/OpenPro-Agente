import { app, BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function emit(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}
