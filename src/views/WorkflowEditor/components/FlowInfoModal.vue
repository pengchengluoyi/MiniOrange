<template>
  <transition name="modal-fade">
    <div class="modal-overlay" v-if="visible" @click.self="handleCancel">
      <div class="modal-content">
        <!-- 标题栏 -->
        <div class="modal-header">
          <div class="title-wrap">
            <span class="icon-bg">📝</span>
            <h3>流程信息设置</h3>
          </div>
          <button class="close-icon-btn" @click="handleCancel" title="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- 表单内容 -->
        <div class="modal-body">
          <div class="form-group">
            <label>流程名称 <span class="required">*</span></label>
            <input
                v-model="localName"
                type="text"
                class="modal-input"
                placeholder="请输入流程名称..."
                ref="nameInputRef"
                @keyup.enter="handleSave"
            />
          </div>

          <div class="form-group">
            <label>用例详情 / 描述</label>
            <textarea
                v-model="localDesc"
                class="modal-textarea"
                placeholder="描述该流程的主要功能和注意事项..."
            ></textarea>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="modal-footer">
          <button class="btn secondary" @click="handleCancel">取消</button>
          <button class="btn primary" @click="handleSave">保存修改</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import {ref, watch, nextTick, onMounted} from 'vue'
import { fetchWorkflowSaveSimple } from '@/api/workflow'
import { ElMessage } from 'element-plus'

const props = defineProps({
  flowName: String,
  flowDescription: String,
  workflowId: [String, Number],
  // 传入 visible 控制显示，或者由父组件 v-if 控制，这里假设是 v-if 模式
  // 为了配合 transition，建议父组件传 visible 或者直接 v-if
})

const emit = defineEmits(['update:flowName', 'update:flowDescription', 'close'])

// 本地状态：防止用户改了一半想取消，结果父组件已经变了
const localName = ref('')
const localDesc = ref('')
const nameInputRef = ref(null)
const visible = ref(true) // 内部控制动画状态

// 初始化数据
watch(() => props.flowName, (val) => localName.value = val, {immediate: true})
watch(() => props.flowDescription, (val) => localDesc.value = val, {immediate: true})

onMounted(() => {
  // 自动聚焦名称输入框
  nextTick(() => {
    nameInputRef.value?.focus()
  })
})

const handleSave = async () => {
  if (!localName.value.trim()) {
    ElMessage.warning('流程名称不能为空')
    return
  }

  // 如果有 ID，调用简单保存接口更新后端
  if (props.workflowId) {
    try {
      await fetchWorkflowSaveSimple(props.workflowId, localName.value, localDesc.value)
      ElMessage.success('信息更新成功')
    } catch (e) {
      console.error(e)
      ElMessage.error('保存失败: ' + (e.message || '未知错误'))
    }
  }

  emit('update:flowName', localName.value)
  emit('update:flowDescription', localDesc.value)
  emit('close')
}

const handleCancel = () => {
  emit('close')
}
</script>

<style scoped>
/* 遮罩层：更深的背景色 + 模糊 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.45); /* 深色遮罩 */
  backdrop-filter: blur(4px); /* 毛玻璃效果 */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* 弹窗主体 */
.modal-content {
  background: #ffffff;
  width: 440px;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* 头部 */
.modal-header {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-bg {
  width: 32px;
  height: 32px;
  background: #eff6ff;
  color: #3b82f6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.close-icon-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-icon-btn:hover {
  background: #f1f5f9;
  color: #ef4444;
}

/* 内容区 */
.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
  margin-left: 2px;
}

/* 输入框美化 */
.modal-input, .modal-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  background-color: #f8fafc; /* 默认微灰背景 */
  border-radius: 8px;
  font-size: 14px;
  color: #1e293b;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box; /* 🔥 关键：防止输入框撑破容器，留出右侧间距 */
}

.modal-input:focus, .modal-textarea:focus {
  background-color: #fff;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.modal-textarea {
  min-height: 100px;
  resize: vertical;
  line-height: 1.5;
}

.modal-input::placeholder, .modal-textarea::placeholder {
  color: #94a3b8;
}

/* 底部按钮 */
.modal-footer {
  padding: 16px 24px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.btn.secondary {
  background: white;
  border-color: #e2e8f0;
  color: #64748b;
}

.btn.secondary:hover {
  background: #f1f5f9;
  color: #334155;
  border-color: #cbd5e1;
}

.btn.primary {
  background: #6366f1; /* Indigo-500 */
  color: white;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
}

.btn.primary:hover {
  background: #4f46e5;
  transform: translateY(-1px);
}

.btn.primary:active {
  transform: translateY(0);
}

/* === 动画效果 Vue Transition === */
.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}

/* 让内容有缩放动画 */
.modal-fade-enter-active .modal-content {
  animation: modal-scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-leave-active .modal-content {
  animation: modal-scale-in 0.2s reverse;
}

@keyframes modal-scale-in {
  0% {
    transform: scale(0.95);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>