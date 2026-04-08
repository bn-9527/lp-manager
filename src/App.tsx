import { useState } from 'react'
import ConnectButton from './components/ConnectButton'
import AddLiquidity from './components/AddLiquidity'
import HookManager from './components/HookManager'
import Tools from './components/Tools'
import './App.css'

// FIX: 构建配置缺失或 dev 模式下 __COMMIT_HASH__ 可能未定义
declare const __COMMIT_HASH__: string | undefined

function App() {
  const [tab, setTab] = useState<'liquidity' | 'hooks' | 'tools'>('liquidity')
  // FIX: 子组件通过 onBusy 回调通知 App 交易进行中，此时禁用 tab 按钮防止切换。
  // 条件渲染会卸载组件销毁交易状态，必须在交易期间阻止 tab 切换。
  const [childBusy, setChildBusy] = useState(false)
  return (
    <div className="app">
      <h1>V4 LP Manager</h1>
      <div className="main-tabs">
        <button className={tab === 'liquidity' ? 'active' : ''} disabled={childBusy} onClick={() => setTab('liquidity')}>
          Add Liquidity
        </button>
        <button className={tab === 'hooks' ? 'active' : ''} disabled={childBusy} onClick={() => setTab('hooks')}>
          Hook Manager
        </button>
        <button className={tab === 'tools' ? 'active' : ''} disabled={childBusy} onClick={() => setTab('tools')}>
          Tools
        </button>
      </div>
      {/* FIX: 条件渲染避免不可见 tab 的 wagmi hooks 持续 poll（约 30+ 并发 RPC 请求/轮）。
          交易期间 tab 按钮 disabled 由 childBusy 控制，防止切换导致状态丢失。 */}
      {tab !== 'tools' && <ConnectButton />}
      {tab === 'liquidity' && <AddLiquidity onBusy={setChildBusy} />}
      {tab === 'hooks' && <HookManager onBusy={setChildBusy} />}
      {tab === 'tools' && <Tools />}
      <footer className="app-footer">build {typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'}</footer>
    </div>
  )
}

export default App
