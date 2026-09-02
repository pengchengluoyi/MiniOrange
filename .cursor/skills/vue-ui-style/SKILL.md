---
name: vue-ui-style
description: Keep MiniOrange Vue UI consistent across Settings, Testing, WorkShell, dialogs, and Element Plus. Use when creating or editing Vue pages, layouts, CSS, dialogs, tables, tabs, or buttons under src/.
---

# Vue UI Style

MiniOrange is Vue 3 + Element Plus. Do not add Naive UI, Ant Design Vue, Vuetify, or a second component library.

Settings pages still follow `.cursor/skills/settings-ui-style/SKILL.md`. This skill covers the rest of the app and the shared tokens.

## Tokens

Use `src/styles/tokens.css` (`--mo-*`). Do not invent new hex colors for chrome, cards, or primary actions.

| Token | Use |
| --- | --- |
| `--mo-bg` | page / settings canvas |
| `--mo-canvas` | WorkShell outer canvas |
| `--mo-card` | cards, panes |
| `--mo-border` | default hairline |
| `--mo-text` / `--mo-muted` | title / secondary |
| `--mo-primary` | primary actions, selected nav |
| `--mo-radius` | cards (`16px`) |
| `--mo-shadow` | elevated cards |

Element Plus is themed through the same file (`--el-color-primary` and friends). Do not override `.el-button` / `.el-input` with a new palette.

## Structure

- Shell chrome lives in `src/layouts/WorkShell.vue` + `work-shell.css`. Do not copy a second sidebar.
- Settings uses `settings-panel` / `settings-card` / `settings-tabbar` from `src/views/Settings/settings-ui.css`.
- Testing already imports that CSS. Prefer those classes over page-local tab bars.
- Loading: `src/global-loading.css` only. No full-white overlays or custom spinners.
- Dialogs / drawers: `src/styles/overlay.css`. Do not restyle `el-dialog` per page.

## Interaction

- Primary actions: Element Plus `type="primary"` or `settings-action-pill`. Not raw Vite-template buttons.
- Immediate-save for single toggles. No extra Save for one switch.
- Tables sit in `settings-table-card` (or the same card look).
- Lucide or Element Plus icons are fine; do not mix both in one toolbar.
- User-facing labels only. No `feishu`, `playwright`, package names in nav.

## Avoid

- New visual language per view (`src/style.css` Vite defaults are unused leftover; do not revive them).
- Dense gray tables without a card.
- Page-local `--primary` / `--brand` that disagree with `--mo-primary`.
- Blocking the chat / work pane with a custom loading mask.
