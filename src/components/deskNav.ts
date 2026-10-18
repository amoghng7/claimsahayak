/** Header panes on the desk. `panel` is the id of the section each tab controls. */
export const DESK_PANES = [
  { id: 'claim', label: 'Your claim', panel: 'your-claim' },
  { id: 'previous', label: 'Previous scans', panel: 'previous-scans' },
  { id: 'sample', label: 'Sample scan', panel: 'sample-scan' },
] as const

export type DeskPane = (typeof DESK_PANES)[number]['id']

export function deskPanel(id: DeskPane): string {
  return DESK_PANES.find((pane) => pane.id === id)?.panel ?? id
}
