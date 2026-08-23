// src/router/index.js
import {createRouter, createWebHashHistory} from 'vue-router'
import { getAuthStatus } from '@/api/auth'
import { useAppStore } from '@/store/appStore'
import { ElMessageBox } from 'element-plus'
import { clearTitlebar } from '@/composables/useTitlebar'
import Schedule from '../views/Schedule/index.vue'
import Login from '../views/Login/index.vue'

// 懒加载组件
const CaseEditor = () => import('../views/WorkReport/components/CaseEditor.vue')
const Dialogue = () => import('../views/Dialogue/index.vue')
const AgentHistory = () => import('../views/AgentHistory/index.vue')
const TestingHome = () => import('../views/Testing/AppList.vue')
const TestingApp = () => import('../views/Testing/AppShell.vue')
const SettingsLayout = () => import('../views/Settings/index.vue')
const SettingsSkills = () => import('../views/Settings/SkillsPage.vue')
const SettingsPacks = () => import('../views/Settings/PacksPage.vue')
const SettingsKeys = () => import('../views/Settings/KeysPage.vue')
const SettingsRuntime = () => import('../views/Settings/RuntimeStatusPage.vue')
const SettingsDeviceDetail = () => import('../views/Settings/DeviceDetailPage.vue')
const SettingsProjectEnv = () => import('../views/Settings/ProjectEnvPage.vue')
const SettingsAppConfig = () => import('../views/Settings/AppConfigPage.vue')
const SettingsSystem = () => import('../views/Settings/SystemPage.vue')
const SettingsAccounts = () => import('../views/Settings/AccountsPage.vue')
const SettingsRoles = () => import('../views/Settings/RolesPage.vue')
const SettingsDispatch = () => import('../views/Settings/DispatchPage.vue')
const SettingsDispatchJob = () => import('../views/Settings/DispatchJobPage.vue')
const SettingsPlugins = () => import('../views/Settings/PluginsPage.vue')
const SettingsPluginDetail = () => import('../views/Settings/PluginDetailPage.vue')
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
            { path: 'skills', name: 'SettingsSkills', component: SettingsSkills, meta: { title: '能力目录' } },
            { path: 'roles', name: 'SettingsRoles', component: SettingsRoles, meta: { title: '角色' } },
            { path: 'dispatch', name: 'SettingsDispatch', component: SettingsDispatch, meta: { title: '调用记录' } },
            { path: 'dispatch/:callId', name: 'SettingsDispatchJob', component: SettingsDispatchJob, meta: { title: '调用详情' } },
            { path: 'plugins', name: 'SettingsPlugins', component: SettingsPlugins, meta: { title: '插件' } },
            { path: 'plugins/:pluginId', name: 'SettingsPluginDetail', component: SettingsPluginDetail, meta: { title: '插件' } },
            { path: 'packs', name: 'SettingsPacks', component: SettingsPacks, meta: { title: '扩展包' } },
            { path: 'keys', name: 'SettingsKeys', component: SettingsKeys, meta: { title: '密钥与发信' } },
            { path: 'system', name: 'SettingsSystem', component: SettingsSystem, meta: { title: '系统设置' } },
            { path: 'accounts', name: 'SettingsAccounts', component: SettingsAccounts, meta: { title: '登录账号' } },
            { path: 'ai', redirect: { name: 'SettingsKeys', query: { tab: 'model-keys' } } },
            { path: 'feishu', redirect: { name: 'SettingsPluginDetail', params: { pluginId: 'feishu' } } },
            { path: 'knowledge', name: 'SettingsKnowledge', redirect: { name: 'TestingHome' } },
            { path: 'projects', redirect: { name: 'TestingHome' } },
            { path: 'apps', redirect: { name: 'TestingHome' } },
            { path: 'projects/:projectId/env', name: 'SettingsProjectEnv', component: SettingsProjectEnv, meta: { title: '项目环境' } },
            {
                path: 'apps/:appId',
                redirect: (to) => ({
                    name: 'TestingApp',
                    params: { appId: to.params.appId },
                    query: { ...to.query, tab: 'process', board: to.query.board || 'req' },
                }),
            },
            {
                path: 'apps/:appId/regression',
                redirect: (to) => ({
                    name: 'TestingApp',
                    params: { appId: to.params.appId },
                    query: { ...to.query, tab: 'process', board: to.query.board || 'req' },
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
            query: { ...to.query, tab: 'cases', view: 'library' },
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
        redirect: (to) => ({ name: 'TestingHome', query: { task: to.params.id } }),
    },
    {
        path: '/report/case/:id',
        name: 'CaseResult',
        redirect: { name: 'TestingHome' },
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
        redirect: { name: 'TestingHome' },
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
        redirect: { name: 'SettingsRuntime', query: { view: 'overview' } },
        meta: { title: '时间线', requiresAuth: true }
    },
    {
        path: '/editor/:id?',
        name: 'Editor',
        redirect: { name: 'TestingHome' },
        meta: { title: '工作流编辑', requiresAuth: true },
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
        const auth = await getAuthStatus()
        const loggedIn = !!auth?.data?.logged_in
        if (to.meta.requiresAuth && !loggedIn) return next('/login')
        if (to.meta.requiresGuest && loggedIn) return next('/dialogue')
        next()
    } catch (e) {
        if (to.meta.requiresAuth) return next('/login')
        next()
    }
})

export default router