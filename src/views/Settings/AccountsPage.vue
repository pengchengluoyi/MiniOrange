<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createAuthUser, deleteAuthUser, getAuthStatus, listAuthUsers } from '@/api/auth'
import './settings-ui.css'

const loading = ref(false)
const saving = ref(false)
const users = ref([])
const meId = ref('')
const form = reactive({
  username: '',
  name: '',
  email: '',
  password: '',
})

const load = async () => {
  loading.value = true
  try {
    const [listRes, meRes] = await Promise.all([listAuthUsers(), getAuthStatus()])
    users.value = listRes?.data?.users || []
    meId.value = String(meRes?.data?.user_id || '')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载账号失败')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.username = ''
  form.name = ''
  form.email = ''
  form.password = ''
}

const addUser = async () => {
  const username = form.username.trim()
  if (!username) {
    ElMessage.warning('请填写账号')
    return
  }
  if (form.password.length < 8) {
    ElMessage.warning('密码至少 8 位')
    return
  }
  saving.value = true
  try {
    await createAuthUser({
      username,
      password: form.password,
      name: form.name.trim(),
      email: form.email.trim(),
    })
    ElMessage.success('已添加账号')
    resetForm()
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '添加失败')
  } finally {
    saving.value = false
  }
}

const removeUser = async (row) => {
  if (row.user_id === meId.value) {
    ElMessage.warning('不能删当前登录的账号')
    return
  }
  try {
    await ElMessageBox.confirm(`删除账号「${row.username || row.name}」？`, '删除账号', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteAuthUser(row.user_id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="settings-panel accounts-page wide-panel" v-loading="loading">
    <header class="settings-page-header">
      <div>
        <h2 class="settings-page-title">登录账号</h2>
        <p class="settings-page-desc">服务器登录用户。邮箱注册仍可用；这里加人后可用账号登录。</p>
      </div>
      <div class="settings-summary-pill">{{ users.length }} 个账号</div>
    </header>

    <section class="settings-card">
      <div class="settings-kicker">添加账号</div>
      <form class="settings-form-stack" @submit.prevent="addUser">
        <label>
          账号
          <input v-model="form.username" type="text" autocomplete="off" placeholder="字母开头，如 admin" />
        </label>
        <label>
          名称
          <input v-model="form.name" type="text" autocomplete="off" placeholder="可选" />
        </label>
        <label>
          邮箱
          <input v-model="form.email" type="email" autocomplete="off" placeholder="可选，也可用邮箱登录" />
        </label>
        <label>
          密码
          <input v-model="form.password" type="password" autocomplete="new-password" placeholder="至少 8 位" />
        </label>
        <div>
          <button type="submit" class="settings-action-pill" :disabled="saving">
            添加账号
            <span class="settings-action-arrow">→</span>
          </button>
        </div>
      </form>
    </section>

    <section class="settings-table-card">
      <el-table :data="users" empty-text="还没有账号">
        <el-table-column label="账号" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.username || '—' }}</template>
        </el-table-column>
        <el-table-column label="名称" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="邮箱" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.email || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="danger"
              :disabled="row.user_id === meId"
              @click="removeUser(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.settings-form-stack label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.settings-form-stack input {
  height: 40px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  color: #111827;
}
.settings-form-stack input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}
</style>
