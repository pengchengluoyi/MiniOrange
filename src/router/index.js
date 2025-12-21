// src/router/index.js
import { createRouter, createWebHashHistory } from 'vue-router'
import ResourceList from '../views/ResourceList.vue'
import WorkflowEditor from '../views/WorkflowEditor/index.vue'
// import WorkflowEditor from '../views/Editor/index.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: ResourceList
  },
  {
    // 编辑器页面，通过 url 参数传递文件路径
    path: '/editor',
    name: 'Editor',
    component: WorkflowEditor
  }
]

const router = createRouter({
  // Electron 必须使用 Hash 模式
  history: createWebHashHistory(),
  routes
})

export default router