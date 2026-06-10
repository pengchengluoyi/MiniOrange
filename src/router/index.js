// src/router/index.js
import {createRouter, createWebHashHistory} from 'vue-router'
import { getNodeStatus } from '@/api/system'
import { useAppStore } from '@/store/appStore'
import { ElMessageBox } from 'element-plus'
import { clearTitlebar } from '@/composables/useTitlebar'
import ResourceList from '../views/ResourceList.vue'
import WorkflowEditor from '../views/WorkflowEditor/index.vue'
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
const Dialogue = () => import('../views/Dialogue/index.vue')
const SettingsLayout = () => import('../views/Settings/index.vue')
const SettingsFeishu = () => import('../views/Settings/FeishuBotsPanel.vue')
const SettingsHub = () => import('../views/Settings/AppsHubPage.vue')
const SettingsProjectEnv = () => import('../views/Settings/ProjectEnvPage.vue')
const SettingsAppConfig = () => import('../views/Settings/AppConfigPage.vue')
const routes = [
    {
        path: '/login',
        name: 'Login',
        component: Login,
        meta: { requiresGuest: true }
    },
    {
        path: '/',
        redirect: '/dialogue'
    },
    {
        path: '/settings',
        component: SettingsLayout,
        meta: { title: '设置', requiresAuth: true },
        redirect: '/settings/hub',
        children: [
            { path: 'hub', name: 'SettingsHub', component: SettingsHub, meta: { title: '应用与环境' } },
            { path: 'feishu', name: 'SettingsFeishu', component: SettingsFeishu, meta: { title: '飞书机器人' } },
            { path: 'knowledge', name: 'SettingsKnowledge', redirect: { name: 'SettingsHub', query: { tab: 'knowledge' } } },
            { path: 'projects', redirect: '/settings/hub' },
            { path: 'apps', redirect: '/settings/hub' },
            { path: 'projects/:projectId/env', name: 'SettingsProjectEnv', component: SettingsProjectEnv, meta: { title: '项目环境' } },
            {
                path: 'apps/:appId',
                redirect: (to) => `/settings/apps/${to.params.appId}/env`,
            },
            {
                path: 'apps/:appId/:section',
                name: 'SettingsAppConfig',
                component: SettingsAppConfig,
                meta: { title: '应用配置' },
            },
        ],
    },
    {
        path: '/report/feishu/:appId',
        redirect: (to) => ({
            path: `/settings/apps/${to.params.appId}/regression`,
            query: to.query,
        }),
    },
    {
        path: '/report/app/:appId/automation',
        redirect: (to) => ({
            path: `/settings/apps/${to.params.appId}/env`,
            query: to.query,
        }),
    },
    {
        path: '/dialogue',
        name: 'Dialogue',
        component: Dialogue,
        meta: { title: '对话流', requiresAuth: true }
    },
    {
        path: '/report/apps',
        name: 'AppList',
        component: AppList,
        meta: {title: '应用列表', requiresAuth: true}
    },
    {
        path: '/report/tasks',
        name: 'TaskList',
        component: TaskList,
        meta: {title: '测试任务', requiresAuth: true}
    },
    {
        path: '/report/task/:id',
        name: 'TaskDetail',
        component: TaskDetailMap,
        meta: {title: '任务详情', requiresAuth: true}
    },
    {
        path: '/report/case/:id',
        name: 'CaseResult',
        component: CaseResult,
        meta: {title: '用例报告', requiresAuth: true}
    },
    {
        path: '/report/editor/:appId',
        name: 'CaseEditor',
        component: CaseEditor,
        meta: {title: '用例编辑', requiresAuth: true}
    },
    {
        path: '/resources',
        name: 'ResourceList',
        component: ResourceList,
        meta: { requiresAuth: true }
    },
    {
        path: '/device',
        name: 'DeviceManage',
        component: DeviceManage,
        meta: { requiresAuth: true }
    },
    {
        path: '/schedule',
        name: 'Schedule',
        component: Schedule,
        meta: { title: '定时任务', requiresAuth: true }
    },
    {
        path: '/timeline',
        name: 'Timeline',
        component: Timeline,
        meta: { title: '时间线', requiresAuth: true }
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
    if (to.fullPath !== from.fullPath) clearTitlebar()

    // In a real app, Pinia is available here because `app.use(router)` is called after `app.use(pinia)`.
    const appStore = useAppStore()

    // 🔥 Dirty State Protection
    if (appStore.isCanvasDirty) {
        try {
            await ElMessageBox.confirm(
                'You have unsaved changes. Are you sure you want to leave?',
                'Unsaved Changes',
                {
                    confirmButtonText: 'Leave',
                    cancelButtonText: 'Stay',
                    type: 'warning',
                }
            )
            // User confirmed, reset dirty state and proceed
            appStore.setCanvasDirty(false)
        } catch (e) {
            // User cancelled, abort navigation
            return next(false)
        }
    }

    // 1. 如果不需要鉴权，直接放行
    if (!to.meta.requiresAuth && !to.meta.requiresGuest) return next()

    try {
        // 2. 获取当前角色状态
        const res = await getNodeStatus()
        const role = res.data?.role

        // 3. 鉴权逻辑
        if (role === 'client' && to.meta.requiresAuth) return next('/login')
        if (role === 'node' && to.meta.requiresGuest) return next('/dialogue')
        
        next()
    } catch (e) {
        // WS 未连接或超时，默认视为未登录，前往 Login 页处理连接
        if (to.meta.requiresAuth) return next('/login')
        next()
    }
})

export default router