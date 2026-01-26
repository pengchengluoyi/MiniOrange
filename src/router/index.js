// src/router/index.js
import {createRouter, createWebHashHistory} from 'vue-router'
import { getNodeStatus } from '@/api/system'
import ResourceList from '../views/ResourceList.vue'
import WorkflowEditor from '../views/WorkflowEditor/index.vue'
import WorkReport from '../views/WorkReport/index.vue'
import DeviceManage from '../views/DeviceManage/index.vue'
import Schedule from '../views/Schedule/index.vue'
import Timeline from '../views/Timeline/index.vue'
import Login from '../views/Login/index.vue'

// 懒加载组件
const AppList = () => import('../views/WorkReport/components/AppList.vue')
const TaskList = () => import('../views/WorkReport/components/TaskList.vue')
const TaskDetailMap = () => import('../views/WorkReport/components/TaskDetailMap.vue')
const CaseResult = () => import('../views/WorkReport/components/CaseResult.vue')
const CaseEditor = () => import('../views/WorkReport/components/CaseEditor.vue')

const routes = [
    {
        path: '/login',
        name: 'Login',
        component: Login,
        meta: { requiresGuest: true }
    },
    {
        path: '/',
        component: WorkReport,
        redirect: '/report/apps', // 默认跳转到应用列表
        meta: { requiresAuth: true },
        children: [
            {
                path: 'report/apps',
                name: 'AppList',
                component: AppList,
                meta: {title: '应用列表'}
            },
            {
                path: 'report/tasks',
                name: 'TaskList',
                component: TaskList,
                meta: {title: '测试任务'}
            },
            {
                path: 'report/task/:id',
                name: 'TaskDetail',
                component: TaskDetailMap,
                meta: {title: '任务详情'}
            },
            {
                path: 'report/case/:id',
                name: 'CaseResult',
                component: CaseResult,
                meta: {title: '用例报告'}
            },
            {
                path: 'report/editor/:appId',
                name: 'CaseEditor',
                component: CaseEditor,
                meta: {title: '用例编辑'}
            },
            {
                path: 'resources',
                name: 'ResourceList',
                component: ResourceList
            },
            {
                path: 'device',
                name: 'DeviceManage',
                component: DeviceManage
            },
            {
                path: 'schedule',
                name: 'Schedule',
                component: Schedule,
                meta: { title: '定时任务' }
            },
            {
                path: 'timeline',
                name: 'Timeline',
                component: Timeline,
                meta: { title: '时间线' }
            }
        ]
    },
    {
        // 修复：添加可选的 :id 参数以支持编辑现有工作流
        path: '/editor/:id?',
        name: 'Editor',
        component: WorkflowEditor
    }
]

const router = createRouter({
    // Electron 必须使用 Hash 模式
    history: createWebHashHistory(),
    routes
})

router.beforeEach(async (to, from, next) => {
    // 1. 如果不需要鉴权，直接放行
    if (!to.meta.requiresAuth && !to.meta.requiresGuest) return next()

    try {
        // 2. 获取当前角色状态
        const res = await getNodeStatus()
        const role = res.data?.role

        // 3. 鉴权逻辑
        if (role === 'client' && to.meta.requiresAuth) return next('/login')
        if (role === 'node' && to.meta.requiresGuest) return next('/')
        
        next()
    } catch (e) {
        // WS 未连接或超时，默认视为未登录，前往 Login 页处理连接
        if (to.meta.requiresAuth) return next('/login')
        next()
    }
})

export default router