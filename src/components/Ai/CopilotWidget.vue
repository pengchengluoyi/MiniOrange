<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElIcon, ElButton, ElInput } from 'element-plus'
import { Promotion, User, MagicStick } from '@element-plus/icons-vue'
import * as chatApi from '@/api/chat'
import { actions as registryActions } from '@/logic/ActionRegistry'

const router = useRouter()
const messages = ref([])
const inputValue = ref('')
const isFocused = ref(false)
const isHovered = ref(false)
const isLoading = ref(false)
const chatContainerRef = ref(null)
const inputRef = ref(null)

// Ghost Mode Logic: Idle when not hovered, not focused, and input is empty
const isIdle = computed(() => !isHovered.value && !isFocused.value && !inputValue.value && !showSlashMenu.value)

// --- Slash Command Logic ---
const showSlashMenu = ref(false)
const slashQuery = ref('')
const selectedSlashIndex = ref(0)

const filteredSlashActions = computed(() => {
  if (!slashQuery.value) return registryActions
  const lower = slashQuery.value.toLowerCase()
  return registryActions.filter(a => 
    a.id.toLowerCase().includes(lower) || 
    a.title.toLowerCase().includes(lower) ||
    (a.keywords && a.keywords.some(k => k.toLowerCase().includes(lower)))
  )
})

const handleInput = (val) => {
  if (val.startsWith('/')) {
    showSlashMenu.value = true
    slashQuery.value = val.slice(1)
    selectedSlashIndex.value = 0
  } else {
    showSlashMenu.value = false
  }
}

const executeSlashCommand = (action) => {
  if (action && action.handler) {
    // Record the command in chat history
    messages.value.push({
      id: Date.now(),
      role: 'user',
      content: `Executed: ${action.title}`,
      isCommand: true
    })
    
    // Execute locally
    action.handler(router)
    
    // Reset UI
    inputValue.value = ''
    showSlashMenu.value = false
    scrollToBottom()
  }
}

const sendMessage = async () => {
  const text = inputValue.value.trim()
  if (!text) return

  // Handle Slash Command via Enter key if menu is open
  if (text.startsWith('/') && showSlashMenu.value && filteredSlashActions.value.length > 0) {
    executeSlashCommand(filteredSlashActions.value[selectedSlashIndex.value])
    return
  }

  // Normal Message
  messages.value.push({ id: Date.now(), role: 'user', content: text })
  inputValue.value = ''
  showSlashMenu.value = false
  isLoading.value = true
  scrollToBottom()

  try {
    const response = await chatApi.sendChatMessage({ text })
    messages.value.push(response)
  } catch (e) {
    messages.value.push({ id: Date.now(), role: 'ai', content: 'Sorry, I encountered an error.' })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

const handleKeydown = (e) => {
  if (showSlashMenu.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value + 1) % filteredSlashActions.value.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedSlashIndex.value = (selectedSlashIndex.value - 1 + filteredSlashActions.value.length) % filteredSlashActions.value.length
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executeSlashCommand(filteredSlashActions.value[selectedSlashIndex.value])
    } else if (e.key === 'Escape') {
      showSlashMenu.value = false
    }
  } else {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
    }
  })
}

onMounted(async () => {
  const history = await chatApi.getChatHistory()
  messages.value = history
  scrollToBottom()
})
</script>

<template>
  <div 
    class="copilot-widget" 
    :class="{ 'ghost-mode': isIdle, 'is-active': !isIdle }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Chat History -->
    <div class="chat-history" ref="chatContainerRef">
      <div v-for="msg in messages" :key="msg.id" class="message-row" :class="msg.role">
        <div class="avatar">
          <el-icon v-if="msg.role === 'ai'"><MagicStick /></el-icon>
          <el-icon v-else><User /></el-icon>
        </div>
        <div class="bubble">
          <span v-if="msg.isCommand" class="command-tag">COMMAND</span>
          {{ msg.content }}
        </div>
      </div>
      <div v-if="isLoading" class="message-row ai">
        <div class="avatar"><el-icon class="is-loading"><MagicStick /></el-icon></div>
        <div class="bubble typing">Thinking...</div>
      </div>
    </div>

    <!-- Slash Command Popover -->
    <div v-if="showSlashMenu" class="slash-menu">
      <div 
        v-for="(action, index) in filteredSlashActions" 
        :key="action.id"
        class="slash-item"
        :class="{ active: index === selectedSlashIndex }"
        @click="executeSlashCommand(action)"
      >
        <span class="slash-title">{{ action.title }}</span>
        <span class="slash-id">{{ action.id }}</span>
      </div>
      <div v-if="filteredSlashActions.length === 0" class="slash-empty">No commands found</div>
    </div>

    <!-- Input Area -->
    <div class="input-area">
      <el-input
        ref="inputRef"
        v-model="inputValue"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 4 }"
        placeholder="Ask AI or type '/' for commands..."
        resize="none"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="isFocused = true"
        @blur="!inputValue && (isFocused = false)"
      />
      <el-button type="primary" circle :icon="Promotion" @click="sendMessage" :disabled="!inputValue" />
    </div>
  </div>
</template>

<style scoped>
/* Widget Container & Ghost Mode */
.copilot-widget {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  max-width: 90vw;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px; /* Capsule / Dynamic Island style */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  z-index: 9000;
}

.copilot-widget.ghost-mode {
  opacity: 0.4;
  transform: translateX(-50%) scale(0.95);
}

.copilot-widget.is-active {
  opacity: 1;
  transform: translateX(-50%) scale(1);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
  background: rgba(255, 255, 255, 0.95);
}

/* Chat History */
.chat-history {
  max-height: 300px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: none; 
}
.chat-history::-webkit-scrollbar { display: none; }

.message-row { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; }
.message-row.user { flex-direction: row-reverse; }

.avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.message-row.ai .avatar { background: #e0e7ff; color: #4f46e5; }
.message-row.user .avatar { background: #f3f4f6; color: #374151; }

.bubble { padding: 8px 12px; border-radius: 12px; max-width: 80%; word-break: break-word; }
.message-row.user .bubble { background: #4f46e5; color: white; border-bottom-right-radius: 2px; }
.message-row.ai .bubble { background: white; border-bottom-left-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

.command-tag { font-size: 10px; background: rgba(255,255,255,0.2); padding: 2px 4px; border-radius: 4px; margin-right: 4px; text-transform: uppercase; font-weight: bold; }

/* Input Area */
.input-area { padding: 12px; display: flex; align-items: flex-end; gap: 8px; border-top: 1px solid rgba(0,0,0,0.05); }
:deep(.el-textarea__inner) { background: transparent; box-shadow: none; border: none; padding: 8px; resize: none; font-family: inherit; }
:deep(.el-textarea__inner:focus) { box-shadow: none; }

/* Slash Menu */
.slash-menu {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
  margin-bottom: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
}

.slash-item { padding: 8px 12px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.1s; }
.slash-item.active, .slash-item:hover { background: #eff6ff; color: #4f46e5; }
.slash-title { font-weight: 500; font-size: 14px; }
.slash-id { font-size: 12px; color: #9ca3af; }
.slash-empty { padding: 12px; text-align: center; color: #9ca3af; font-size: 13px; }
</style>