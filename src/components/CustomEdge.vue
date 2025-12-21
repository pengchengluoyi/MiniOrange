<template>
  <BaseEdge
    :path="path[0]"
    :marker-end="markerEnd"
    :style="style"
  />

  <EdgeLabelRenderer>
    <div
      class="edge-btn-wrapper"
      :style="{
        transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)`,
        opacity: isHovered ? 1 : 0,
        pointerEvents: 'all'
      }"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <!--
         @click.stop: 阻止冒泡，防止选中线
         @mousedown.stop: 防止触发画布拖拽
      -->
      <button class="add-btn" @click.stop="onClick" @mousedown.stop>+</button>
    </div>
  </EdgeLabelRenderer>

  <!-- 隐形感应区 -->
  <path
    :d="path[0]"
    fill="none"
    stroke="transparent"
    stroke-width="20"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    style="pointer-events: stroke; cursor: pointer;"
  />
</template>

<script>
export default { inheritAttrs: false }
</script>

<script setup>
import { ref, computed } from 'vue'
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@vue-flow/core'

const props = defineProps({
  id: String,
  source: String,
  target: String,
  sourceX: Number,
  sourceY: Number,
  targetX: Number,
  targetY: Number,
  sourcePosition: String,
  targetPosition: String,
  markerEnd: String,
  style: Object,
  data: Object,
  sourceHandleId: String,
  targetHandleId: String
})

const isHovered = ref(false)
const path = computed(() => getBezierPath(props))

const onClick = (evt) => {
  // 派发事件
  const event = new CustomEvent('split-edge', {
    detail: {
      edgeId: props.id,
      source: props.source,
      target: props.target,
      sourceHandle: props.sourceHandleId,
      targetHandle: props.targetHandleId
    }
  })
  window.dispatchEvent(event)
}
</script>

<style scoped>
.edge-btn-wrapper { position: absolute; z-index: 100; transition: opacity 0.2s; }
.add-btn { width: 20px; height: 20px; background: #6366f1; color: white; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.1s; }
.add-btn:hover { transform: scale(1.2); background: #4f46e5; }
</style>