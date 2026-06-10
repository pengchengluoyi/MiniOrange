function stripNumberPrefix(s) {
  return String(s || '')
    .replace(/^\d+[.、．)）]\s*/, '')
    .trim()
}

/** 与后端 feishu_service._split_numbered_lines 对齐，并支持同行多序号（如 1. xxx 2. yyy） */
export function splitNumberedLines(text) {
  const raw = String(text || '').trim()
  if (!raw) return []

  if (raw.includes('\n')) {
    const byNl = raw
      .split(/\n+/)
      .map((p) => stripNumberPrefix(p.trim()))
      .filter(Boolean)
    if (byNl.length > 1) return byNl
  }

  const parts = raw
    .split(/\s*(?=\d+[.、．)）]\s*)/)
    .map((p) => stripNumberPrefix(p.trim()))
    .filter(Boolean)

  if (parts.length <= 1) return [raw]
  return parts
}

/** 优先用已解析数组，否则拆分 raw 文本 */
export function caseFieldLines(row, { listKey, rawKey }) {
  const list = row?.[listKey]
  if (Array.isArray(list) && list.length) return list
  const raw = row?.[rawKey] ?? ''
  return splitNumberedLines(raw)
}
