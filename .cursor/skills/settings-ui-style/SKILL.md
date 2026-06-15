---
name: settings-ui-style
description: Keep MiniOrange Settings pages visually consistent. Use when creating or editing Vue settings pages under src/views/Settings, including tabs, cards, key configuration, Skills catalog, robots, applications, or environment configuration UI.
---

# Settings UI Style

## Use This Skill When

Apply this skill whenever editing `src/views/Settings/**` or adding settings-related pages, panels, cards, tabs, forms, tables, or action buttons.

## Core Rule

Use the shared settings style layer in `src/views/Settings/settings-ui.css`. Prefer semantic classes over local one-off CSS.

Do not create a new visual language for each page.

## Required Page Structure

Settings pages should follow this hierarchy:

```vue
<div class="settings-panel your-page wide-panel">
  <header class="settings-page-header">
    <div>
      <h2 class="settings-page-title">页面标题</h2>
      <p class="settings-page-desc">一句话说明这个页面管理什么。</p>
    </div>
    <div class="settings-summary-pill">可选状态</div>
  </header>

  <div class="settings-tabbar">
    <button class="settings-tab active">
      <strong>Tab 名称</strong>
      <span>Tab 说明</span>
    </button>
  </div>

  <section class="settings-card">内容</section>
</div>
```

## Shared Classes

- `settings-page-header`: page title row.
- `settings-page-title`: page title, 22px, bold.
- `settings-page-desc`: short muted description.
- `settings-summary-pill`: small status badge in page header.
- `settings-tabbar`: second-level tab container with bottom rule.
- `settings-tab`: tab button with title + subtitle.
- `settings-card`: regular content card.
- `settings-table-card`: table container card.
- `settings-info-card`: highlighted blue/purple guidance card.
- `settings-kicker`: small section label inside highlighted cards.
- `settings-action-pill`: colored pill action button.
- `settings-action-arrow`: small arrow dot inside action pill.

## Visual Tokens

Use these defaults unless a page has a strong reason not to:

- Background: `#f6f7fb`
- Card background: `#ffffff`
- Border: `#e3e8f0`
- Text: `#111827`
- Muted text: `#6b7280`
- Primary: `#6366f1`
- Radius: `16px`
- Shadow: `0 10px 24px rgba(15, 23, 42, 0.04)`

## Interaction Rules

- Top-level Settings navigation lives in `Settings/index.vue`; do not duplicate it inside pages.
- Settings should open on `运行状态` first; keep runtime/status before app configuration in the settings sidebar.
- Use `settings-tabbar` for page-level tabs, not ad-hoc cards that look like forms.
- Use `settings-info-card` for explanatory sections, not plain gray boxes.
- For platform/app-specific actions, use `settings-action-pill` with `--brand`.
- Prefer immediate-save for simple switches. Do not add a save button for a single toggle unless batching is required.
- Tables should sit inside `settings-table-card`.
- Loading states must use the app-wide loading style from `src/global-loading.css`. It is okay to use `v-loading`, but do not add one-off full-white overlays, custom spinners, or raw Element Plus loading visuals inside settings pages.

## Avoid

- New local tab styles (`.seg`, `.key-tabs`, etc.) unless they extend shared classes.
- Raw Element Plus default small buttons for primary card actions.
- Dense gray tables without card context.
- Multiple competing titles inside one Settings page.
- Exposing implementation names such as `feishu` in generic settings navigation; use user-facing labels like `机器人` or `密钥配置`.
- Page-specific loading masks that wash out the whole UI or block the chat panel visually.
