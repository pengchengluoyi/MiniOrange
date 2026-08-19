<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPack, savePackYaml, setPackLifecycle } from '@/api/packs'
import PackDryRunDialog from './PackDryRunDialog.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  uid: { type: String, default: '' },
  // inline：嵌入到外层抽屉/弹窗内容区；不再渲染 el-drawer 的遮罩与方向
  inline: { type: Boolean, default: false },
  // compact：步骤详情里展开，只看内容，不出现编辑/试跑控制台
  compact: { type: Boolean, default: false },
  // 列表行数据：抽屉先用它渲染，详情请求回来再覆盖（避免打开时闪空白）
  row: { type: Object, default: null },
  fixture: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'changed'])

const loading = ref(false)
const saving = ref(false)
const item = ref(null)
const activeTab = ref('content')
const dryRunOpen = ref(false)
const editing = ref(false)
const draftYaml = ref('')

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const load = async () => {
  if (!props.uid) return
  // fixture 模式下后端没有对应详情，直接用列表行数据
  if (props.fixture) {
    item.value = props.row
    return
  }
  loading.value = true
  try {
    const res = await getPack(props.uid)
    item.value = res?.data?.item || props.row
  } catch (e) {
    ElMessage.error('读取条目详情失败')
    item.value = props.row
  } finally {
    loading.value = false
  }
}

watch(() => [props.modelValue, props.uid], ([open]) => {
  if (open) {
    activeTab.value = 'content'
    editing.value = false
    item.value = props.row
    load()
  }
}, { immediate: true })

// —— 动作：启停 / 编辑保存 / 试跑 ——

const canWrite = computed(() => !props.fixture && !!item.value?.source_path)

const toggleEnabled = async () => {
  if (!canWrite.value) return
  const on = !item.value.enabled || item.value.lifecycle !== 'active'
  try {
    const res = await setPackLifecycle(props.uid, {
      lifecycle: on ? 'active' : 'deprecated',
      enabled: on,
    })
    item.value = res?.data?.item || item.value
    ElMessage.success(on ? '已启用' : '已停用')
    emit('changed')
  } catch (e) {
    ElMessage.error(String(e?.response?.data?.detail || '操作失败').slice(0, 160))
  }
}

const startEdit = () => {
  draftYaml.value = item.value?.raw_yaml || ''
  editing.value = true
  activeTab.value = 'yaml'
}

const saveEdit = async () => {
  saving.value = true
  try {
    const res = await savePackYaml(props.uid, draftYaml.value)
    item.value = res?.data?.item || item.value
    await load()
    editing.value = false
    ElMessage.success('已保存并重载')
    emit('changed')
  } catch (e) {
    // 后端校验不过会返回 400 + 具体原因，原样弹给人看
    const detail = e?.response?.data?.detail || e?.message || '保存失败'
    ElMessageBox.alert(String(detail), '校验未通过，未写入', { type: 'error' })
  } finally {
    saving.value = false
  }
}

const detail = computed(() => item.value?.detail || {})
const scope = computed(() => item.value?.scope || {})
const stats = computed(() => item.value?.stats || {})

const PROVIDER_LABEL = {
  platform: '平台团队',
  device_team: '设备环境组',
  app_qa: '业务测试',
  learned: '自动学习',
  doc: '文档学习',
  third_party: '第三方',
}
const LIFECYCLE_LABEL = { draft: '待确认', review: '待评审', active: '生效中', deprecated: '已停用' }

const kv = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}=${v}`)

const hitRate = computed(() => {
  const h = Number(stats.value.hit_count || 0)
  const r = Number(stats.value.refuted_count || 0)
  if (!h && !r) return '暂无命中记录'
  return `采纳 ${h} 次 / 被推翻 ${r} 次`
})
</script>

<template>
  <el-drawer v-if="!props.inline" v-model="visible" :size="640" :with-header="false" class="pack-drawer">
    <div v-loading="loading" class="pd-wrap">
      <header v-if="item" class="pd-head">
        <div class="pd-title-row">
          <h3 class="pd-title">{{ item.title || item.id }}</h3>
          <el-tag size="small" :type="item.lifecycle === 'active' ? 'success' : 'info'" effect="light">
            {{ LIFECYCLE_LABEL[item.lifecycle] || item.lifecycle }}
          </el-tag>
        </div>
        <div class="pd-actions-bar">
          <el-button v-if="canWrite" size="small" @click="startEdit">编辑 YAML</el-button>
          <el-button
            v-if="!fixture && item.kind === 'recovery'" size="small" type="primary" plain
            @click="dryRunOpen = true"
          >试跑</el-button>
          <el-button v-if="canWrite" size="small" :type="item.lifecycle === 'active' ? 'danger' : 'success'"
                     plain @click="toggleEnabled">
            {{ item.lifecycle === 'active' ? '停用' : '启用' }}
          </el-button>
        </div>
        <div class="pd-meta">
          <span class="pd-chip">{{ PROVIDER_LABEL[item.provider] || item.provider }}</span>
          <span v-if="item.owner" class="pd-owner">{{ item.owner }}</span>
          <span v-else class="pd-owner missing">未指定负责人</span>
          <code class="pd-id">{{ item.id }}</code>
        </div>
      </header>

      <el-tabs v-if="item" v-model="activeTab" class="pd-tabs">
        <el-tab-pane label="内容" name="content">
          <dl class="pd-dl">
            <template v-if="item.kind === 'knowledge'">
              <dt>分类</dt>
              <dd>{{ detail.category || '—' }}</dd>

              <template v-if="detail.tags?.length">
                <dt>标签</dt>
                <dd>
                  <code v-for="t in detail.tags" :key="t" class="pd-tag">{{ t }}</code>
                </dd>
              </template>

              <dt>知识内容</dt>
              <dd>
                <pre class="pd-pre">{{ detail.content || '—' }}</pre>
              </dd>
            </template>

            <template v-if="item.when">
              <dt>触发</dt><dd>{{ item.when }}</dd>
            </template>
            <template v-if="detail.mode">
              <dt>形态</dt>
              <dd>
                <code>{{ detail.mode }}</code>
                <span class="pd-hint">{{ detail.mode === 'deterministic'
                  ? '命中即按动作执行，不问模型' : '只给模型提示，由它看图决定' }}</span>
              </dd>
            </template>
            <template v-if="Object.keys(detail.match?.evidence || {}).length">
              <dt>匹配·设备事实</dt>
              <dd><code v-for="s in kv(detail.match.evidence)" :key="s" class="pd-tag">{{ s }}</code></dd>
            </template>
            <template v-if="detail.match?.screen_text_any?.length">
              <dt>匹配·屏上文案</dt>
              <dd><code v-for="s in detail.match.screen_text_any" :key="s" class="pd-tag">{{ s }}</code></dd>
            </template>
            <template v-if="detail.match?.top_window_pkg_prefix?.length">
              <dt>匹配·顶层窗口</dt>
              <dd><code v-for="s in detail.match.top_window_pkg_prefix" :key="s" class="pd-tag">{{ s }}</code></dd>
            </template>
            <template v-if="detail.actions?.length">
              <dt>处置动作</dt>
              <dd>
                <ol class="pd-actions">
                  <li v-for="(a, i) in detail.actions" :key="i">
                    <code>{{ a.capability }}</code>
                    <span v-if="Object.keys(a.target || {}).length" class="pd-anchor">
                      锚点 {{ kv(a.target).join(' ') }}
                    </span>
                    <span v-if="Object.keys(a.params || {}).length" class="pd-hint">
                      {{ kv(a.params).join(' ') }}
                    </span>
                  </li>
                </ol>
              </dd>
            </template>
            <template v-if="Object.keys(detail.verify?.evidence || {}).length">
              <dt>复查条件</dt>
              <dd><code v-for="s in kv(detail.verify.evidence)" :key="s" class="pd-tag ok">{{ s }}</code></dd>
            </template>
            <template v-if="detail.forbid?.text_any?.length">
              <dt>安全护栏</dt>
              <dd>
                <code v-for="s in detail.forbid.text_any" :key="s" class="pd-tag danger">{{ s }}</code>
                <span class="pd-hint">这些文案永远不许点</span>
              </dd>
            </template>
            <template v-if="detail.prompt_snippet">
              <dt>给模型的提示</dt>
              <dd><pre class="pd-pre">{{ detail.prompt_snippet }}</pre></dd>
            </template>
            <template v-if="detail.then">
              <dt>结论</dt><dd><pre class="pd-pre">{{ detail.then }}</pre></dd>
            </template>
            <template v-if="detail.status">
              <dt>可测性</dt>
              <dd>
                <el-tag size="small" :type="detail.status === 'supported' ? 'success'
                  : (detail.status === 'partial' ? 'warning' : 'danger')" effect="light">
                  {{ detail.status }}
                </el-tag>
                <span v-if="detail.gap" class="pd-hint">缺口：{{ detail.gap }}</span>
              </dd>
            </template>
            <template v-if="detail.unlock">
              <dt>解锁条件</dt><dd>{{ detail.unlock }}</dd>
            </template>
            <template v-if="detail.implementations?.length">
              <dt>实现路径</dt>
              <dd>
                <div v-for="im in detail.implementations" :key="im.id" class="pd-impl">
                  <code>{{ im.executor }}</code>
                  <span class="pd-hint">{{ im.id }}</span>
                  <el-tag v-if="im.has_low_level" size="small" effect="plain">low_level 声明</el-tag>
                </div>
                <p v-if="detail.pure_declarative" class="pd-note ok">
                  纯声明式：无 Python 分支，仅靠 YAML 即可执行
                </p>
                <p v-else-if="detail.has_python_branch" class="pd-note">
                  有 Python 实现分支
                </p>
              </dd>
            </template>
            <template v-if="scope.platforms?.length || scope.app_ids?.length || scope.visible_to?.length">
              <dt>作用域</dt>
              <dd>
                <code v-for="p in scope.platforms" :key="p" class="pd-tag">{{ p }}</code>
                <code v-for="a in scope.app_ids" :key="a" class="pd-tag">app {{ String(a).slice(0, 8) }}</code>
                <code v-if="scope.app_versions" class="pd-tag">{{ scope.app_versions }}</code>
                <code v-for="v in scope.visible_to" :key="v" class="pd-tag">可见 {{ v }}</code>
              </dd>
            </template>
          </dl>
        </el-tab-pane>

        <el-tab-pane label="依据" name="evidence">
          <ul v-if="(detail.evidence_notes || detail.evidence || []).length" class="pd-evidence">
            <li v-for="(e, i) in (detail.evidence_notes || detail.evidence)" :key="i">{{ e }}</li>
          </ul>
          <el-empty v-else description="这条没写依据 —— 体检会提醒补上" :image-size="72" />
        </el-tab-pane>

        <el-tab-pane label="命中记录" name="stats">
          <p class="pd-hitrate">{{ hitRate }}</p>
          <p v-if="stats.last_hit_at" class="pd-hint">最近命中：{{ stats.last_hit_at }}</p>
          <el-alert type="info" :closable="false" show-icon
            title="命中统计尚未接入执行链路" class="pd-alert"
            description="要等 agent 主循环把每步注入/命中的条目写回后，这里才会有数据。" />
        </el-tab-pane>

        <el-tab-pane label="原始 YAML" name="yaml">
          <p class="pd-path"><code>{{ item.source_path || '—' }}</code></p>
          <template v-if="editing">
            <el-input v-model="draftYaml" type="textarea" :rows="22" class="pd-editor" spellcheck="false" />
            <div class="pd-editor-bar">
              <el-button size="small" @click="editing = false">取消</el-button>
              <el-button size="small" type="primary" :loading="saving" @click="saveEdit">
                保存并重载
              </el-button>
              <span class="pd-hint">校验不过不会写入源文件</span>
            </div>
          </template>
          <template v-else>
            <pre v-if="item.raw_yaml" class="pd-yaml">{{ item.raw_yaml }}</pre>
            <el-empty v-else :description="item.raw_yaml_error || '未读取到源文件'" :image-size="72" />
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>

    <PackDryRunDialog
      v-model="dryRunOpen" :uid="uid" :title="item?.title || item?.id || ''"
      :mode="detail.mode || ''"
    />
  </el-drawer>

  <div v-else v-if="visible" v-loading="loading" class="pd-wrap pd-inline" :class="{ compact }">
    <header v-if="item" class="pd-head">
      <div class="pd-title-row">
        <h3 class="pd-title">{{ item.title || item.id }}</h3>
        <el-tag size="small" :type="item.lifecycle === 'active' ? 'success' : 'info'" effect="light">
          {{ LIFECYCLE_LABEL[item.lifecycle] || item.lifecycle }}
        </el-tag>
      </div>
      <div v-if="!compact" class="pd-actions-bar">
        <el-button v-if="canWrite" size="small" @click="startEdit">编辑 YAML</el-button>
        <el-button
          v-if="!fixture && item.kind === 'recovery'" size="small" type="primary" plain
          @click="dryRunOpen = true"
        >试跑</el-button>
        <el-button v-if="canWrite" size="small" :type="item.lifecycle === 'active' ? 'danger' : 'success'"
                   plain @click="toggleEnabled">
          {{ item.lifecycle === 'active' ? '停用' : '启用' }}
        </el-button>
      </div>
      <div class="pd-meta">
        <span class="pd-chip">{{ PROVIDER_LABEL[item.provider] || item.provider }}</span>
        <span v-if="item.owner" class="pd-owner">{{ item.owner }}</span>
        <span v-else class="pd-owner missing">未指定负责人</span>
        <code class="pd-id">{{ item.id }}</code>
      </div>
    </header>

    <el-tabs v-if="item" v-model="activeTab" class="pd-tabs">
      <el-tab-pane label="内容" name="content">
        <dl class="pd-dl">
          <template v-if="item.kind === 'knowledge'">
            <dt>分类</dt>
            <dd>{{ detail.category || '—' }}</dd>

            <template v-if="detail.tags?.length">
              <dt>标签</dt>
              <dd>
                <code v-for="t in detail.tags" :key="t" class="pd-tag">{{ t }}</code>
              </dd>
            </template>

            <dt>知识内容</dt>
            <dd>
              <pre class="pd-pre">{{ detail.content || '—' }}</pre>
            </dd>
          </template>

          <template v-if="item.when">
            <dt>触发</dt><dd>{{ item.when }}</dd>
          </template>
          <template v-if="detail.mode">
            <dt>形态</dt>
            <dd>
              <code>{{ detail.mode }}</code>
              <span class="pd-hint">{{ detail.mode === 'deterministic'
                ? '命中即按动作执行，不问模型' : '只给模型提示，由它看图决定' }}</span>
            </dd>
          </template>
          <template v-if="Object.keys(detail.match?.evidence || {}).length">
            <dt>匹配·设备事实</dt>
            <dd><code v-for="s in kv(detail.match.evidence)" :key="s" class="pd-tag">{{ s }}</code></dd>
          </template>
          <template v-if="detail.match?.screen_text_any?.length">
            <dt>匹配·屏上文案</dt>
            <dd><code v-for="s in detail.match.screen_text_any" :key="s" class="pd-tag">{{ s }}</code></dd>
          </template>
          <template v-if="detail.match?.top_window_pkg_prefix?.length">
            <dt>匹配·顶层窗口</dt>
            <dd><code v-for="s in detail.match.top_window_pkg_prefix" :key="s" class="pd-tag">{{ s }}</code></dd>
          </template>
          <template v-if="detail.actions?.length">
            <dt>处置动作</dt>
            <dd>
              <ol class="pd-actions">
                <li v-for="(a, i) in detail.actions" :key="i">
                  <code>{{ a.capability }}</code>
                  <span v-if="Object.keys(a.target || {}).length" class="pd-anchor">
                    锚点 {{ kv(a.target).join(' ') }}
                  </span>
                  <span v-if="Object.keys(a.params || {}).length" class="pd-hint">
                    {{ kv(a.params).join(' ') }}
                  </span>
                </li>
              </ol>
            </dd>
          </template>
          <template v-if="Object.keys(detail.verify?.evidence || {}).length">
            <dt>复查条件</dt>
            <dd><code v-for="s in kv(detail.verify.evidence)" :key="s" class="pd-tag ok">{{ s }}</code></dd>
          </template>
          <template v-if="detail.forbid?.text_any?.length">
            <dt>安全护栏</dt>
            <dd>
              <code v-for="s in detail.forbid.text_any" :key="s" class="pd-tag danger">{{ s }}</code>
              <span class="pd-hint">这些文案永远不许点</span>
            </dd>
          </template>
          <template v-if="detail.prompt_snippet">
            <dt>给模型的提示</dt>
            <dd><pre class="pd-pre">{{ detail.prompt_snippet }}</pre></dd>
          </template>
          <template v-if="detail.then">
            <dt>结论</dt><dd><pre class="pd-pre">{{ detail.then }}</pre></dd>
          </template>
          <template v-if="detail.status">
            <dt>可测性</dt>
            <dd>
              <el-tag size="small" :type="detail.status === 'supported' ? 'success'
                : (detail.status === 'partial' ? 'warning' : 'danger')" effect="light">
                {{ detail.status }}
              </el-tag>
              <span v-if="detail.gap" class="pd-hint">缺口：{{ detail.gap }}</span>
            </dd>
          </template>
          <template v-if="detail.unlock">
            <dt>解锁条件</dt><dd>{{ detail.unlock }}</dd>
          </template>
          <template v-if="detail.implementations?.length">
            <dt>实现路径</dt>
            <dd>
              <div v-for="im in detail.implementations" :key="im.id" class="pd-impl">
                <code>{{ im.executor }}</code>
                <span class="pd-hint">{{ im.id }}</span>
                <el-tag v-if="im.has_low_level" size="small" effect="plain">low_level 声明</el-tag>
              </div>
              <p v-if="detail.pure_declarative" class="pd-note ok">
                纯声明式：无 Python 分支，仅靠 YAML 即可执行
              </p>
              <p v-else-if="detail.has_python_branch" class="pd-note">
                有 Python 实现分支
              </p>
            </dd>
          </template>
          <template v-if="scope.platforms?.length || scope.app_ids?.length || scope.visible_to?.length">
            <dt>作用域</dt>
            <dd>
              <code v-for="p in scope.platforms" :key="p" class="pd-tag">{{ p }}</code>
              <code v-for="a in scope.app_ids" :key="a" class="pd-tag">app {{ String(a).slice(0, 8) }}</code>
              <code v-if="scope.app_versions" class="pd-tag">{{ scope.app_versions }}</code>
              <code v-for="v in scope.visible_to" :key="v" class="pd-tag">可见 {{ v }}</code>
            </dd>
          </template>
        </dl>
      </el-tab-pane>

      <el-tab-pane label="依据" name="evidence">
        <ul v-if="(detail.evidence_notes || detail.evidence || []).length" class="pd-evidence">
          <li v-for="(e, i) in (detail.evidence_notes || detail.evidence)" :key="i">{{ e }}</li>
        </ul>
        <el-empty v-else description="这条没写依据 —— 体检会提醒补上" :image-size="72" />
      </el-tab-pane>

      <el-tab-pane label="命中记录" name="stats">
        <p class="pd-hitrate">{{ hitRate }}</p>
        <p v-if="stats.last_hit_at" class="pd-hint">最近命中：{{ stats.last_hit_at }}</p>
        <el-alert type="info" :closable="false" show-icon
          title="命中统计尚未接入执行链路" class="pd-alert"
          description="要等 agent 主循环把每步注入/命中的条目写回后，这里才会有数据。" />
      </el-tab-pane>

      <el-tab-pane label="原始 YAML" name="yaml">
        <p class="pd-path"><code>{{ item.source_path || '—' }}</code></p>
        <template v-if="editing">
          <el-input v-model="draftYaml" type="textarea" :rows="22" class="pd-editor" spellcheck="false" />
          <div class="pd-editor-bar">
            <el-button size="small" @click="editing = false">取消</el-button>
            <el-button size="small" type="primary" :loading="saving" @click="saveEdit">
              保存并重载
            </el-button>
            <span class="pd-hint">校验不过不会写入源文件</span>
          </div>
        </template>
        <template v-else>
          <pre v-if="item.raw_yaml" class="pd-yaml">{{ item.raw_yaml }}</pre>
          <el-empty v-else :description="item.raw_yaml_error || '未读取到源文件'" :image-size="72" />
        </template>
      </el-tab-pane>
    </el-tabs>

    <PackDryRunDialog
      v-model="dryRunOpen" :uid="uid" :title="item?.title || item?.id || ''"
      :mode="detail.mode || ''"
    />
  </div>
</template>

<style scoped>
.pd-wrap { padding: 4px 4px 24px; }
.pd-inline { width: 100%; }
.pd-inline.compact .pd-head { border-bottom: none; padding-bottom: 4px; }
.pd-inline.compact .pd-title { font-size: 14px; }
.pd-inline.compact .pd-tabs :deep(.el-tabs__header) { display: none; }
.pd-inline.compact .pd-tabs { margin-top: 0; }
.pd-inline.compact .pd-dl { grid-template-columns: 1fr; gap: 4px 0; }
.pd-inline.compact .pd-dl dt { padding-top: 8px; }
.pd-inline.compact .pd-owner.missing { display: none; }
.pd-head { padding: 8px 4px 12px; border-bottom: 1px solid var(--el-border-color-lighter); }
.pd-title-row { display: flex; align-items: center; gap: 8px; }
.pd-title { margin: 0; font-size: 17px; font-weight: 600; }
.pd-meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.pd-chip {
  font-size: 12px; padding: 1px 8px; border-radius: 10px;
  background: var(--el-fill-color); color: var(--el-text-color-regular);
}
.pd-owner { font-size: 12px; color: var(--el-text-color-secondary); }
.pd-owner.missing { color: var(--el-color-warning); }
.pd-id { font-size: 12px; color: var(--el-text-color-placeholder); }
.pd-tabs { margin-top: 4px; }
.pd-dl { margin: 0; display: grid; grid-template-columns: 96px 1fr; gap: 10px 12px; }
.pd-dl dt { font-size: 12px; color: var(--el-text-color-secondary); padding-top: 2px; }
.pd-dl dd { margin: 0; font-size: 13px; line-height: 1.6; word-break: break-word; }
.pd-tag {
  display: inline-block; margin: 0 6px 4px 0; padding: 1px 6px; border-radius: 4px;
  background: var(--el-fill-color-light); font-size: 12px;
}
.pd-tag.ok { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.pd-tag.danger { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
.pd-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 6px; }
.pd-anchor { font-size: 12px; color: var(--el-color-primary); margin-left: 6px; }
.pd-actions { margin: 0; padding-left: 18px; }
.pd-actions li { margin-bottom: 4px; }
.pd-impl { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.pd-note { margin: 6px 0 0; font-size: 12px; color: var(--el-text-color-secondary); }
.pd-note.ok { color: var(--el-color-success); }
.pd-pre, .pd-yaml {
  margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--el-fill-color-light);
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
.pd-yaml { max-height: 60vh; overflow: auto; }
.pd-evidence { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.8; }
.pd-hitrate { margin: 0 0 6px; font-size: 14px; font-weight: 500; }
.pd-alert { margin-top: 12px; }
.pd-path { margin: 0 0 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.pd-actions-bar { display: flex; gap: 8px; margin-top: 10px; }
.pd-editor :deep(textarea) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.pd-editor-bar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
</style>
