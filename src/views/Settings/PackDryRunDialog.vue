<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { dryRunPack } from '@/api/packs'
import { getDeviceList } from '@/api/device'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  uid: { type: String, default: '' },
  title: { type: String, default: '' },
  mode: { type: String, default: '' },          // deterministic | advise
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const devices = ref([])
const sn = ref('')
const pkg = ref('')
const running = ref(false)
const result = ref(null)

// 只列出 adb 可用的设备：dry-run 走 adb 取证与层级
const androidDevices = computed(() =>
  (devices.value || []).filter((d) => d?.channels?.adb_state === 'connected'),
)

const loadDevices = async () => {
  try {
    const list = await getDeviceList()
    devices.value = Array.isArray(list) ? list : (list?.data || [])
    if (!sn.value && androidDevices.value.length) {
      sn.value = androidDevices.value[0].channels?.adb_serial || androidDevices.value[0].sn
    }
  } catch (e) {
    ElMessage.error('读取设备列表失败')
  }
}

const run = async (execute = 0) => {
  if (!sn.value) {
    ElMessage.warning('先选一台 adb 已连通的设备')
    return
  }
  if (execute) {
    try {
      await ElMessageBox.confirm(
        '将按规则在设备上真实执行动作（forbid 名单仍会拦截）。确定继续？',
        '真的执行', { type: 'warning', confirmButtonText: '执行', cancelButtonText: '取消' },
      )
    } catch (e) { return }
  }
  running.value = true
  try {
    const res = await dryRunPack(props.uid, {
      sn: sn.value, source: 'device', execute, package: pkg.value || undefined,
    })
    result.value = res?.data || null
  } catch (e) {
    const detail = e?.response?.data?.detail || e?.message || '试跑失败'
    ElMessage.error(String(detail).slice(0, 160))
    result.value = null
  } finally {
    running.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (open) {
    result.value = null
    loadDevices()
  }
})

onMounted(loadDevices)
</script>

<template>
  <el-dialog v-model="visible" :title="`试跑 · ${title || uid}`" width="680px" class="dry-dialog">
    <div class="dr-form">
      <el-select v-model="sn" placeholder="选设备（仅列 adb 已连通）" class="dr-sn" filterable>
        <el-option
          v-for="d in androidDevices"
          :key="d.sn"
          :label="`${d.model || d.sn}（${d.channels?.adb_serial || d.sn}）`"
          :value="d.channels?.adb_serial || d.sn"
        />
      </el-select>
      <el-input v-model="pkg" placeholder="被测应用包名（可选，用于判断前台/进程存活）" class="dr-pkg" clearable />
      <el-button type="primary" :loading="running" @click="run(0)">只预演</el-button>
      <el-button
        v-if="mode === 'deterministic'" :loading="running" type="warning" plain @click="run(1)"
      >真的执行</el-button>
    </div>
    <p v-if="!androidDevices.length" class="dr-warn">没有 adb 已连通的设备，先在「运行状态」里连一台。</p>

    <div v-if="result" class="dr-result">
      <div class="dr-verdict" :class="{ hit: result.matched }">
        {{ result.matched ? '✅ 命中' : '⭘ 未命中' }}
        <span v-if="result.match_reasons?.length" class="dr-reasons">
          {{ result.match_reasons.join(' · ') }}
        </span>
      </div>

      <dl class="dr-dl">
        <dt>设备事实</dt>
        <dd><code class="dr-tag" v-for="(v, k) in result.evidence" :key="k">{{ k }}={{ v }}</code></dd>

        <dt>层级</dt>
        <dd>
          {{ result.hierarchy?.nodes }} 节点 · {{ result.hierarchy?.elapsed_ms }}ms ·
          来源 <code>{{ result.hierarchy?.source }}</code>
        </dd>

        <template v-if="result.planned_actions?.length">
          <dt>会做什么</dt>
          <dd>
            <ol class="dr-actions">
              <li v-for="(a, i) in result.planned_actions" :key="i"
                  :class="{ blocked: a.blocked_by_forbid }">
                <code>{{ a.capability }}</code>
                <span v-if="Object.keys(a.target || {}).length" class="dr-hint">
                  锚点 {{ Object.entries(a.target).map(([k, v]) => `${k}=${v}`).join(' ') }}
                </span>
                <span v-if="Object.keys(a.params || {}).length" class="dr-hint">
                  {{ Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join(' ') }}
                </span>
                <el-tag v-if="a.blocked_by_forbid" size="small" type="danger" effect="light">
                  被护栏拦下：{{ a.blocked_by_forbid }}
                </el-tag>
              </li>
            </ol>
            <p v-if="!result.executed" class="dr-hint">以上仅为预演，未在设备上执行。</p>
          </dd>
        </template>

        <template v-if="result.advice">
          <dt>会注入什么</dt>
          <dd><pre class="dr-pre">{{ result.advice }}</pre></dd>
        </template>

        <template v-if="result.execution">
          <dt>执行结果</dt>
          <dd>
            <p class="dr-exec" :class="{ ok: result.execution.recovered }">
              {{ result.execution.summary }}
            </p>
            <ul class="dr-exec-list">
              <li v-for="(a, i) in result.execution.actions" :key="i">
                <code>{{ a.capability }}</code> → {{ a.status || a.skipped }}
                <span v-if="a.summary" class="dr-hint">{{ a.summary }}</span>
              </li>
            </ul>
            <p v-if="result.execution.error" class="dr-err">{{ result.execution.error }}</p>
          </dd>
        </template>

        <template v-if="result.screen_text_sample?.length">
          <dt>屏上文案</dt>
          <dd class="dr-texts">
            <code v-for="(t, i) in result.screen_text_sample" :key="i" class="dr-tag">{{ t }}</code>
          </dd>
        </template>
      </dl>
    </div>
  </el-dialog>
</template>

<style scoped>
.dr-form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dr-sn { width: 240px; }
.dr-pkg { width: 260px; }
.dr-warn { margin: 10px 0 0; font-size: 12px; color: var(--el-color-warning); }
.dr-result { margin-top: 16px; }
.dr-verdict {
  font-size: 14px; font-weight: 600; padding: 8px 10px; border-radius: 6px;
  background: var(--el-fill-color-light); color: var(--el-text-color-regular);
}
.dr-verdict.hit { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.dr-reasons { margin-left: 8px; font-size: 12px; font-weight: 400; }
.dr-dl { margin: 12px 0 0; display: grid; grid-template-columns: 80px 1fr; gap: 10px 12px; }
.dr-dl dt { font-size: 12px; color: var(--el-text-color-secondary); }
.dr-dl dd { margin: 0; font-size: 13px; line-height: 1.6; }
.dr-tag {
  display: inline-block; margin: 0 6px 4px 0; padding: 1px 6px; border-radius: 4px;
  background: var(--el-fill-color-light); font-size: 12px; max-width: 260px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom;
}
.dr-actions { margin: 0; padding-left: 18px; }
.dr-actions li.blocked { color: var(--el-color-danger); }
.dr-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 6px; }
.dr-pre {
  margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--el-fill-color-light);
  font-size: 12px; line-height: 1.6; white-space: pre-wrap;
}
.dr-exec { margin: 0 0 6px; font-weight: 500; }
.dr-exec.ok { color: var(--el-color-success); }
.dr-exec-list { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7; }
.dr-err { margin: 6px 0 0; font-size: 12px; color: var(--el-color-danger); }
.dr-texts { max-height: 96px; overflow: auto; }
</style>
