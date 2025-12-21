<template>
  <div class="tree-node-wrapper">
    <!-- 1. 节点行 -->
    <div
      class="node-line"
      :class="{ 'selected': isSelected, 'hovered': isHovered }"
      :style="{ paddingLeft: depth * 14 + 'px' }"
      @mouseover.stop="onMouseOver"
      @mouseout.stop="onMouseOut"
      @click.stop="onClick"
    >
      <!-- 展开/折叠三角 -->
      <span
        class="arrow"
        :class="{ 'expanded': isExpanded, 'invisible': !hasChildren }"
        @click.stop="toggle"
      >▶</span>

      <!-- 开始标签 -->
      <span class="tag-part">
        <span class="bracket">&lt;</span>
        <span class="tag-name">{{ node.tagName }}</span>

        <!-- 属性列表 -->
        <span v-for="(val, key) in node.attributes" :key="key" class="attr-group">
          <span class="attr-name">&nbsp;{{ key }}</span>
          <span class="attr-eq">=</span>
          <span class="attr-val">"{{ val }}"</span>
        </span>

        <span class="bracket">&gt;</span>
      </span>

      <!-- 文本内容 (如果有) -->
      <span v-if="!isExpanded && hasChildren" class="ellipsis">...</span>
      <span v-if="!hasChildren && node.text" class="text-node">{{ node.text }}</span>

      <!-- 结束标签 (仅当没有子节点或单行显示时) -->
      <span v-if="!hasChildren" class="tag-part">
        <span class="bracket">&lt;/</span>
        <span class="tag-name">{{ node.tagName }}</span>
        <span class="bracket">&gt;</span>
      </span>
    </div>

    <!-- 2. 子节点 (递归) -->
    <div v-if="isExpanded && hasChildren" class="children-container">
      <DomTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-id="selectedId"
        @node-hover="$emit('node-hover', $event)"
        @node-click="$emit('node-click', $event)"
      />
    </div>

    <!-- 3. 闭合标签 (仅当展开且有子节点时显示在下一行) -->
    <div
      v-if="isExpanded && hasChildren"
      class="node-line close-line"
      :class="{ 'selected': isSelected, 'hovered': isHovered }"
      :style="{ paddingLeft: depth * 14 + 'px' }"
      @mouseover.stop="onMouseOver"
      @mouseout.stop="onMouseOut"
      @click.stop="onClick"
    >
      <span class="tag-part">
        <span class="bracket">&lt;/</span>
        <span class="tag-name">{{ node.tagName }}</span>
        <span class="bracket">&gt;</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  selectedId: String
})

const emit = defineEmits(['node-hover', 'node-click'])

const isExpanded = ref(false)
const isHovered = ref(false)

const hasChildren = computed(() => props.node.children && props.node.children.length > 0)
const isSelected = computed(() => props.node.id === props.selectedId)

const toggle = () => {
  if (hasChildren.value) isExpanded.value = !isExpanded.value
}

const onMouseOver = () => {
  isHovered.value = true
  // 传递 rect 给父组件画框
  if (props.node.rect) emit('node-hover', props.node)
}

const onMouseOut = () => {
  isHovered.value = false
  emit('node-hover', null)
}

const onClick = () => {
  emit('node-click', props.node)
}
</script>

<style scoped>
.tree-node-wrapper {
  font-family: Consolas, "Lucide Console", "Courier New", monospace;
  font-size: 12px;
  line-height: 16px;
  color: #333;
  cursor: default;
  user-select: none;
}

.node-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* 允许属性换行，防止撑破容器 */
  padding-top: 1px;
  padding-bottom: 1px;
}

.node-line.hovered {
  background-color: #f0f7ff; /* 浅蓝背景 hover */
}

.node-line.selected {
  background-color: #cfe8fc; /* 选中背景 */
}

/* 箭头 */
.arrow {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 2px;
  font-size: 9px;
  color: #72777d;
  cursor: pointer;
  transition: transform 0.1s;
}
.arrow.expanded { transform: rotate(90deg); }
.arrow.invisible { visibility: hidden; }

/* 颜色定义 (仿 Chrome DevTools Light Theme) */
.bracket { color: #a9a9a9; } /* < > */
.tag-name { color: #881280; } /* div, span (Purple) */
.attr-name { color: #994500; } /* class, id (Brown) */
.attr-val { color: #1a1aa6; }  /* "wrapper" (Blue) */
.text-node { color: #333; margin-left: 2px; }
.ellipsis { background: #ddd; color: #555; padding: 0 2px; border-radius: 2px; margin: 0 2px; font-size: 10px; }

/* 布局微调 */
.attr-group { white-space: pre; } /* 保留属性前的空格 */
.children-container {
  /* 子节点无需额外 margin，因为使用了 paddingLeft 动态计算 */
}
</style>