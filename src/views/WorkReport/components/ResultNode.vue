<template>
  <div class="organic-node" :class="data.status">
    <Handle type="target" position="left" class="custom-handle" />
    <div class="node-wrapper">
      <div class="status-indicator">
        <el-icon v-if="data.status === 'pass'"><Check /></el-icon>
        <el-icon v-else-if="data.status === 'fail'"><Close /></el-icon>
        <span v-else>●</span>
      </div>
      <div class="content">
        <div class="label">{{ label }}</div>
        <div class="time" v-if="data.duration">{{ data.duration }}s</div>
      </div>
    </div>
    <Handle type="source" position="right" class="custom-handle" />
  </div>
</template>

<style scoped>
.organic-node {
  min-width: 160px; padding: 4px; border-radius: 30px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 1);
  box-shadow: 0 10px 25px rgba(0,0,0,0.05);
  transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.organic-node:hover {
  transform: scale(1.05);
  box-shadow: 0 15px 35px rgba(0,0,0,0.1);
}

.node-wrapper { display: flex; align-items: center; gap: 12px; padding: 8px 16px; }

.status-indicator {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
}

/* 状态色系：液态柔和感 */
.pass .status-indicator { background: #ecfdf5; color: #10b981; }
.pass { border-color: #10b98133; box-shadow: 0 8px 20px rgba(16, 185, 129, 0.1); }

.fail .status-indicator { background: #fef2f2; color: #ef4444; }
.fail { border-color: #ef444433; box-shadow: 0 8px 20px rgba(239, 68, 68, 0.1); }

.content .label { font-size: 13px; font-weight: 700; color: #1e293b; }
.content .time { font-size: 11px; color: #94a3b8; margin-top: 2px; }

.custom-handle {
  width: 8px; height: 8px; background: #cbd5e1; border: 2px solid #fff;
}
</style>