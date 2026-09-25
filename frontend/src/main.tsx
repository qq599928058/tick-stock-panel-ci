import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { initializeFrontendExtensions } from './extensions/bootstrap'
import './index.css'

// 全局认证拦截: 任何 query/mutation 收到 401 (未登录/会话过期) → 跳登录页。
// api.ts 的 request() 已对 401 静默 (不弹 toast), 这里统一负责跳转。
// 排除 /login 自身的请求, 避免登录页请求失败又跳登录形成死循环。
const _redirectToLogin = (() => {
  let redirecting = false
  return (err: unknown) => {
    if (redirecting) return
    if (!(err instanceof Error)) return
    const msg = err.message || ''
    // 401 (未登录/会话过期) → 跳登录页
    // 403 未初始化 (面板未设密码, 公网访问) → 也跳登录页(显示设密码提示)
    const is401 = msg.includes('未登录') || msg.includes('会话已过期') || msg.includes('401')
    const isNotInit = msg.includes('尚未初始化访问密码') || msg.includes('NOT_INITIALIZED')
    if (!is401 && !isNotInit) return
    // 子路径部署(nginx /panel/)时，登录页自身也要带前缀，否则会跳到 easy_tdx 的根路径上（踩过：
    // 未登录访问 /panel/ 被弹到 https://host:8000/login，那是另一个应用，看着就像"密码不对"）。
    // redirect 参数交给 react-router 处理（它按 basename 还原），所以传的是**不带前缀**的相对路径。
    const baseUrl = import.meta.env.BASE_URL || '/'
    const loginPath = `${baseUrl}login`
    // 已在登录页则不跳(避免死循环)
    if (window.location.pathname === loginPath) return
    redirecting = true
    const rel = window.location.pathname.slice(baseUrl.length - 1) + window.location.search
    const redirect = encodeURIComponent(rel)
    window.location.href = `${loginPath}?redirect=${redirect}`
  }
})()

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => _redirectToLogin(err),
  }),
  defaultOptions: {
    queries: {
      staleTime: 5_000,           // 5s 内复用,与 §4.2 Repository 不变量一致
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (err) => _redirectToLogin(err),
    },
  },
})

async function bootstrap() {
  await initializeFrontendExtensions()
  const { router } = await import('./router')
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
