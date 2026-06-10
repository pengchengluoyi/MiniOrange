<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listFeishuBots, createFeishuBot, updateFeishuBot, deleteFeishuBot } from '@/api/settings'

const loading = ref(false)
const saving = ref(false)
const bots = ref([])

const dialogVisible = ref(false)
const editingId = ref('')
const form = ref({ name: '', app_id: '', app_secret: '' })

const load = async () => {
  loading.value = true
  try {
    const res = await listFeishuBots()
    bots.value = res?.data?.bots || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = ''
  form.value = { name: '', app_id: '', app_secret: '' }
  dialogVisible.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  form.value = { name: row.name, app_id: row.app_id, app_secret: '' }
  dialogVisible.value = true
}

const submit = async () => {
  if (!form.value.name?.trim()) {
    ElMessage.warning('请填写机器人名称')
    return
  }
  if (!form.value.app_id?.trim()) {
    ElMessage.warning('请填写 App ID')
    return
  }
  if (!editingId.value && !form.value.app_secret?.trim()) {
    ElMessage.warning('新建时请填写 App Secret')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateFeishuBot(editingId.value, {
        name: form.value.name.trim(),
        app_id: form.value.app_id.trim(),
        app_secret: form.value.app_secret?.trim() || '',
      })
      ElMessage.success('已更新')
    } else {
      await createFeishuBot({
        name: form.value.name.trim(),
        app_id: form.value.app_id.trim(),
        app_secret: form.value.app_secret.trim(),
      })
      ElMessage.success('已添加')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除机器人「${row.name}」？`, '删除确认', { type: 'warning' })
    await deleteFeishuBot(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="feishu-bots-panel">
    <header class="panel-header">
      <div>
        <h2>飞书机器人</h2>
        <p>可配置多个机器人，不同应用/任务可绑定不同机器人执行。</p>
      </div>
      <el-button type="primary" @click="openCreate">+ 添加机器人</el-button>
    </header>

    <el-table v-loading="loading" :data="bots" border stripe empty-text="暂无机器人，请点击添加">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="app_id" label="App ID" min-width="200" show-overflow-tooltip />
      <el-table-column prop="app_secret_masked" label="App Secret" width="140" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.configured ? 'success' : 'info'" size="small">
            {{ row.configured ? '就绪' : '未完成' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="help-block">
      <h3>说明</h3>
      <ul>
        <li>在 <a href="https://open.feishu.cn/app" target="_blank" rel="noopener">飞书开放平台</a> 创建企业自建应用</li>
        <li>权限：查看、评论和导出电子表格</li>
        <li>应用「飞书回归」页可选择本列表中的机器人读取表格</li>
      </ul>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑机器人' : '添加机器人'"
      width="480px"
      destroy-on-close
    >
      <el-form label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：造好物回归、社区巡检" />
        </el-form-item>
        <el-form-item label="App ID" required>
          <el-input v-model="form.app_id" placeholder="cli_xxxxxxxx" />
        </el-form-item>
        <el-form-item label="App Secret" :required="!editingId">
          <el-input
            v-model="form.app_secret"
            type="password"
            show-password
            :placeholder="editingId ? '留空保持不变' : '必填'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.panel-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
}
.panel-header p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}
.help-block {
  margin-top: 24px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.8;
}
.help-block h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #334155;
}
.help-block ul {
  margin: 0;
  padding-left: 20px;
}
.help-block a {
  color: #2563eb;
}
</style>
