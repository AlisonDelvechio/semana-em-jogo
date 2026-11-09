// The app-level confirmation dialog, passed down to screens that need to ask first.
export type ConfirmOptions = {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
}
export type AskConfirmation = (options: ConfirmOptions) => Promise<boolean>
