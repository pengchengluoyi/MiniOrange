function stripNumberPrefix(s) {
  let t = String(s || '').trim()
  while (t) {
    const next = t.replace(/^\d+[.、．)）]\s*/, '').trim()
    if (next === t) break
    t = next
  }
  return t
}

/** 执行结果行与缓存用例行字段名不一致时统一结构 */
export function normalizeCaseRow(row) {
  const r = row || {}
  return {
    ...r,
    steps: r.steps || r.step_lines || [],
    expected: r.expected || r.expected_lines || [],
    step_nums: r.step_nums || [],
    expected_nums: r.expected_nums || [],
    expected_by_step: r.expected_by_step || {},
    steps_raw: r.steps_raw || '',
    expected_raw: r.expected_raw || '',
    precondition: r.precondition || r.precondition_raw || '',
  }
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

  if (parts.length <= 1) {
    const one = stripNumberPrefix(raw)
    return one ? [one] : []
  }
  return parts
}

/** 返回 { num, text }[]，num 与飞书原文编号一致（可跳号如 2/3/4） */
export function caseFieldLines(row, { listKey, rawKey, numsKey }) {
  const normalized = normalizeCaseRow(row)
  const list = normalized?.[listKey]
  const nums = normalized?.[numsKey]
  if (Array.isArray(list) && list.length) {
    if (Array.isArray(nums) && nums.length === list.length) {
      return list.map((text, i) => ({
        num: Number(nums[i]) || i + 1,
        text: stripNumberPrefix(text),
      }))
    }
    return list.map((text, i) => ({ num: i + 1, text: stripNumberPrefix(text) }))
  }
  const raw = normalized?.[rawKey] ?? ''
  const parts = splitNumberedLines(raw)
  return parts.map((text, i) => ({ num: i + 1, text }))
}

/** 步骤与预期按编号对齐（无预期的行留空，无步骤的行也留空） */
export function alignCaseStepExpected(row) {
  const normalized = normalizeCaseRow(row)
  const steps = caseFieldLines(normalized, {
    listKey: 'steps',
    rawKey: 'steps_raw',
    numsKey: 'step_nums',
  })
  const expectedItems = caseFieldLines(normalized, {
    listKey: 'expected',
    rawKey: 'expected_raw',
    numsKey: 'expected_nums',
  })
  const expectedMap = {}
  for (const e of expectedItems) {
    if (e.text) expectedMap[e.num] = e.text
  }
  const ebs = normalized?.expected_by_step
  if (ebs && typeof ebs === 'object') {
    for (const [k, v] of Object.entries(ebs)) {
      const num = Number(k)
      if (Number.isFinite(num) && v) expectedMap[num] = String(v)
    }
  }
  const nums = [
    ...new Set([
      ...steps.map((s) => s.num),
      ...Object.keys(expectedMap).map((k) => Number(k)),
    ]),
  ].sort((a, b) => a - b)
  const stepMap = Object.fromEntries(steps.map((s) => [s.num, s.text]))
  return nums.map((num) => ({
    num,
    step: stepMap[num] || '',
    expected: expectedMap[num] || '',
  }))
}
