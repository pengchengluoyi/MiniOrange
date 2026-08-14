// src/router/index.js
import {createRouter, createWebHashHistory} from 'vue-router'
import { getNodeStatus } from '@/api/system'
import { useAppStore } from '@/store/appStore'
import { ElMessageBox } from 'element-plus'
import { clearTitlebar } from '@/composables/useTitlebar'
import ResourceList from '../views/ResourceList.vue'
import WorkflowEditor from '../views/WorkflowEditor/index.vue'
import Schedule from '../views/Schedule/index.vue'
import Timeline from '../views/Timeline/index.vue'
import Login from '../views/Login/index.vue'

// 懒加载组件
const TaskDetailMap = () => import('../views/WorkReport/components/TaskDetailMap.vue')
const CaseResult = () => import('../views/WorkReport/components/CaseResult.vue')
const CaseEditor = () => import('../views/WorkReport/components/CaseEditor.vue')
const Dialogue = () => import('../views/Dialogue/index.vue')
const AgentHistory = () => import('../views/AgentHistory/index.vue')
const TestingHome = () => import('../views/Testing/AppList.vue')
const TestingApp = () => import('../views/Testing/AppShell.vue')
const SettingsLayout = () => import('../views/Settings/index.vue')
const SettingsSkills = () => import('../views/Settings/SkillsPage.vue')
const SettingsKeys = () => import('../views/Settings/KeysPage.vue')
const SettingsRuntime = () => import('../views/Settings/RuntimeStatusPage.vue')
const SettingsDeviceDetail = () => import('../views/Settings/DeviceDetailPage.vue')
const SettingsProjectEnv = () => import('../views/Settings/ProjectEnvPage.vue')
const SettingsAppConfig = () => import('../views/Settings/AppConfigPage.vue')
const SettingsSystem = () => import('../views/Settings/SystemPage.vue')
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
        redirect: '/settings/runtime?view=overview',
        children: [
            { path: 'hub', name: 'SettingsHub', redirect: { name: 'TestingHome' } },
            { path: 'runtime', name: 'SettingsRuntime', component: SettingsRuntime, meta: { title: '运行状态' } },
            { path: 'runtime/device/:sn', name: 'SettingsDeviceDetail', component: SettingsDeviceDetail, meta: { title: '设备详情' } },
            { path: 'schedule', name: 'SettingsSchedule', component: Schedule, meta: { title: '定时任务' } },
            { path: 'skills', name: 'SettingsSkills', component: SettingsSkills, meta: { title: 'Skills' } },
            { path: 'keys', name: 'SettingsKeys', component: SettingsKeys, meta: { title: '密钥配置' } },
            { path: 'system', name: 'SettingsSystem', component: SettingsSystem, meta: { title: '系统设置' } },
            { path: 'ai', redirect: { name: 'SettingsKeys', query: { tab: 'model-keys' } } },
            { path: 'feishu', redirect: { name: 'SettingsKeys', query: { tab: 'robots' } } },
            { path: 'knowledge', name: 'SettingsKnowledge', redirect: { name: 'TestingHome' } },
            { path: 'projects', redirect: { name: 'TestingHome' } },
            { path: 'apps', redirect: { name: 'TestingHome' } },
            { path: 'projects/:projectId/env', name: 'SettingsProjectEnv', component: SettingsProjectEnv, meta: { title: '项目环境' } },
            {
                path: 'apps/:appId',
                redirect: (to) => ({
                    name: 'TestingApp',
                    params: { appId: to.params.appId },
                    query: { ...to.query, tab: 'tasks' },
                }),
            },
            {
                path: 'apps/:appId/regression',
                redirect: (to) => ({
                    name: 'TestingApp',
                    params: { appId: to.params.appId },
                    query: { ...to.query, tab: 'tasks' },
                }),
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
            name: 'TestingApp',
            params: { appId: to.params.appId },
            query: { ...to.query, tab: 'tasks' },
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
        meta: { title: 'Agent', requiresAuth: true, workMode: 'agent' }
    },
    {
        path: '/agents',
        name: 'AgentHistory',
        component: AgentHistory,
        meta: { title: 'Agent 对话记录', requiresAuth: true, workMode: 'agent' }
    },
    {
        path: '/testing',
        name: 'TestingHome',
        component: TestingHome,
        meta: { title: '测试', requiresAuth: true, workMode: 'testing' }
    },
    {
        path: '/testing/:appId',
        name: 'TestingApp',
        component: TestingApp,
        meta: { title: '测试工作台', requiresAuth: true, workMode: 'testing' }
    },
    {
        path: '/testing/:appId/tasks/:taskId',
        redirect: (to) => ({
            name: 'TestingApp',
            params: { appId: to.params.appId },
            query: {
                ...to.query,
                tab: 'tasks',
                task: to.params.taskId,
            },
        }),
    },
    {
        path: '/report/apps',
        redirect: { name: 'TestingHome' },
        meta: {title: '应用列表', requiresAuth: true}
    },
    {
        path: '/report/tasks',
        name: 'TaskList',
        redirect: { name: 'TestingHome' },
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
        path: '/schedule',
        redirect: { name: 'SettingsSchedule' },
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