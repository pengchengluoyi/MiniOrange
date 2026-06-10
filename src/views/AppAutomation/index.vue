<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getAppAutomationConfig,
  updateAppAutomationConfig,
  listIconTargets,
  saveIconTarget,
  deleteIconTarget,
  uploadIconImage,
  getGraphIconCandidates,
  importGraphIcon,
} from '@/api/appAutomation'
import { getBaseUrl } from '@/utils/config'
import { getDeviceList } from '@/api/device'
import { wsGetDeviceList } from '@/api/wsAppGraph'
import { initWebSocket } from '@/api/mWebSocket'

const route = useRoute()
const router = useRouter()
const appId = computed(() => route.params.appId)
const appName = computed(() => route.query.appName || '应用')

const loading = ref(false)
const saving = ref(false)
const packageName = ref('')
const envProfiles = ref(['dev', 'test', 'pre', 'prod'])
const envProfile = ref('test')
const selectedDeviceSn = ref('*')
const devices = ref([])

const skillsDefault = ref({ pre: [], post: [] })
const skillsDevices = ref({})
const iconPage = ref(1)
const iconPageSize = ref(20)
const iconTotal = ref(0)
const iconKeyword = ref('')
const iconTargets = ref([])
const graphCandidates = ref([])
const showGraphImport = ref(false)
const staticBase = getBaseUrl()

const deviceSkillBlock = computed(() => {
  if (selectedDeviceSn.value === '*') {
    return skillsDefault.value
  }
  if (!skillsDevices.value[selectedDeviceSn.value]) {
    skillsDevices.value[selectedDeviceSn.value] = { pre: [], post: [] }
  }
  return skillsDevices.value[selectedDeviceSn.value]
})

const preLines = computed({
  get: () => (deviceSkillBlock.value.pre || []).join('\n'),
  set: (v) => {
    deviceSkillBlock.value.pre = String(v || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  },
})

const postLines = computed({
  get: () => (deviceSkillBlock.value.post || []).join('\n'),
  set: (v) => {
    deviceSkillBlock.value.post = String(v || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  },
})

const normalizeDevices = (res) => {
  const list = Array.isArray(res) ? res : res?.data || []
  return list.filter((d) => d.status === 'online')
}

const load = async () => {
  loading.value = true
  try {
    const res = await getAppAutomationConfig(appId.value)
    const data = res?.data || {}
    packageName.value = data.package || ''
    envProfiles.value = data.env_profiles || envProfiles.value
    envProfile.value = data.env_profile || data.automation?.env_profile || 'test'
    const auto = data.automation || {}
    skillsDefault.value = {
      pre: [...(auto.skills?.default?.pre || [])],
      post: [...(auto.skills?.default?.post || [])],
    }
    skillsDevices.value = { ...(auto.skills?.devices || {}) }
    await loadIconTargets()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadDevices = async () => {
  try {
    let list = []
    try {
      list = normalizeDevices(await wsGetDeviceList())
    } catch {
      initWebSocket()
      list = normalizeDevices(await getDeviceList())
    }
    devices.value = list
  } catch {
    devices.value = []
  }
}

const loadIconTargets = async () => {
  const res = await listIconTargets(appId.value, {
    page: iconPage.value,
    page_size: iconPageSize.value,
    keyword: iconKeyword.value,
  })
  const data = res?.data || {}
  iconTargets.value = data.items || []
  iconTotal.value = data.total || 0
}

const save = async () => {
  saving.value = true
  try {
    await updateAppAutomationConfig(appId.value, {
      env_profile: envProfile.value,
      skills: {
        default: skillsDefault.value,
        devices: skillsDevices.value,
      },
    })
    ElMessage.success('Skills 已保存')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const saveIconRow = async (row) => {
  if (!row.name?.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  await saveIconTarget(appId.value, row)
  ElMessage.success('图标目标已保存')
  await loadIconTargets()
}

const addIconTarget = () => {
  iconTargets.value.unshift({
    id: '',
    name: '',
    x: 0,
    y: 0,
    w: 80,
    h: 80,
    image_url: '',
    note: '',
  })
}

const removeIconTarget = async (row) => {
  if (row.id) {
    await deleteIconTarget(appId.value, row.id)
  }
  await loadIconTargets()
}

const onIconUpload = async (row, { file }) => {
  const res = await uploadIconImage(appId.value, file)
  row.image_url = res?.data?.image_url || ''
  ElMessage.success('图片已上传')
}

const imgUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${staticBase}${path}`
}

const openGraphImport = async () => {
  const res = await getGraphIconCandidates(appId.value)
  graphCandidates.value = res?.data?.items || []
  showGraphImport.value = true
}

const doImportGraph = async (uid) => {
  await importGraphIcon(appId.value, uid)
  ElMessage.success('已从应用图谱导入')
  showGraphImport.value = false
  await loadIconTargets()
}

const onGraphRowClick = (row) => {
  if (row?.component_uid) {
    doImportGraph(row.component_uid)
  }
}

const editCases = () =>
  router.push(`/report/editor/${appId.value}`)

const goBack = () => router.push({ name: 'AppList' })
const goFeishu = () =>
  router.push({
    name: 'FeishuRegression',
    params: { appId: appId.value },
    query: { appName: appName.value },
  })

onMounted(async () => {
  await Promise.all([load(), loadDevices()])
})
</script>

<template>
  <div class="app-automation-page">
    <header class="page-header">
      <div>
        <el-button text @click="goBack">← 应用列表</el-button>
        <h1>应用自动化配置</h1>
        <p>{{ appName }} · Skills 与无字图标目标（服务端存储）</p>
      </div>
      <div class="header-actions">
        <el-button @click="goFeishu">飞书回归</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
      </div>
    </header>

    <el-row :gutter="16" v-loading="loading">
      <el-col :span="24">
        <el-card shadow="never" class="panel">
          <template #header>
            <span>运行环境</span>
          </template>
          <el-form label-width="120px" inline>
            <el-form-item label="环境 Profile">
              <el-select v-model="envProfile" style="width: 160px">
                <el-option v-for="p in envProfiles" :key="p" :label="p" :value="p" />
              </el-select>
            </el-form-item>
            <el-form-item label="Android 包名">
              <span class="mono">{{ packageName || '未配置（请在项目环境配置中填写）' }}</span>
            </el-form-item>
          </el-form>
          <p class="hint">执行回归时会按此 Profile 拉起对应包名到前台（用例明确要求切后台的除外）。</p>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="card-head">
              <span>Skills（前置 / 后置）</span>
              <el-select v-model="selectedDeviceSn" size="small" style="width: 200px">
                <el-option label="全部设备（默认）" value="*" />
                <el-option
                  v-for="d in devices"
                  :key="d.sn"
                  :label="`${d.name || d.sn}`"
                  :value="d.sn"
                />
              </el-select>
            </div>
          </template>
          <p class="hint">每行一条自然语言指令，与对话流语法一致，例如：打开造好物、点击我的</p>
          <el-form label-position="top">
            <el-form-item label="前置 Skills">
              <el-input v-model="preLines" type="textarea" :rows="5" placeholder="执行用例前自动运行" />
            </el-form-item>
            <el-form-item label="后置 Skills">
              <el-input v-model="postLines" type="textarea" :rows="4" placeholder="执行用例后自动运行" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="24">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="card-head">
              <span>无字图标目标（{{ iconTotal }}）</span>
              <div class="card-head-actions">
                <el-input v-model="iconKeyword" size="small" placeholder="搜索名称" style="width: 140px" @keyup.enter="loadIconTargets" />
                <el-button size="small" @click="loadIconTargets">搜索</el-button>
                <el-button size="small" @click="openGraphImport">从应用图谱导入</el-button>
                <el-button size="small" @click="editCases">打开图谱</el-button>
                <el-button size="small" type="primary" @click="addIconTarget">+ 新建</el-button>
              </div>
            </div>
          </template>
          <p class="hint">支持上传截图模板；执行时按名称匹配坐标。大量目标请用分页列表管理，可与图谱组件关联。</p>
          <el-table :data="iconTargets" border size="small" empty-text="暂无图标目标">
            <el-table-column label="预览" width="72">
              <template #default="{ row }">
                <img v-if="row.image_url" :src="imgUrl(row.image_url)" class="thumb" />
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="100">
              <template #default="{ row }">
                <el-input v-model="row.name" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="区域 x,y,w,h" width="240">
              <template #default="{ row }">
                <div class="coord-row">
                  <el-input-number v-model="row.x" :min="0" size="small" controls-position="right" />
                  <el-input-number v-model="row.y" :min="0" size="small" controls-position="right" />
                  <el-input-number v-model="row.w" :min="0" size="small" controls-position="right" />
                  <el-input-number v-model="row.h" :min="0" size="small" controls-position="right" />
                </div>
              </template>
            </el-table-column>
            <el-table-column label="上传图" width="100">
              <template #default="{ row }">
                <el-upload :show-file-list="false" :auto-upload="true" :http-request="(o) => onIconUpload(row, o)">
                  <el-button size="small" link>上传</el-button>
                </el-upload>
              </template>
            </el-table-column>
            <el-table-column prop="note" label="备注" min-width="80">
              <template #default="{ row }">
                <el-input v-model="row.note" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button type="primary" link @click="saveIconRow(row)">存</el-button>
                <el-button type="danger" link @click="removeIconTarget(row)">删</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-if="iconTotal > iconPageSize"
            class="pager"
            layout="prev, pager, next, total"
            :total="iconTotal"
            :page-size="iconPageSize"
            v-model:current-page="iconPage"
            @current-change="loadIconTargets"
          />
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showGraphImport" title="从应用图谱导入组件" width="520px">
      <el-table
        :data="graphCandidates"
        size="small"
        max-height="360"
        @row-click="onGraphRowClick"
      >
        <el-table-column prop="label" label="组件" />
        <el-table-column label="区域" width="160">
          <template #default="{ row }">{{ row.x }},{{ row.y }} {{ row.w }}×{{ row.h }}</template>
        </el-table-column>
      </el-table>
      <p v-if="!graphCandidates.length" class="hint">请先在「用例编排/应用图谱」中标注页面组件</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-automation-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 32px 48px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.page-header h1 {
  margin: 8px 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
}
.page-header p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}
.panel {
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hint {
  color: #6b7280;
  font-size: 12px;
  margin: 0 0 12px;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: #374151;
}
.coord-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.card-head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.thumb {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
.muted {
  color: #9ca3af;
  font-size: 12px;
}
</style>
