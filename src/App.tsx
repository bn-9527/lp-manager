import { useState } from 'react'
import ConnectButton from './components/ConnectButton'
import AddLiquidity from './components/AddLiquidity'
import HookManager from './components/HookManager'
import Tools from './components/Tools'
import './App.css'

declare const __COMMIT_HASH__: string

function App() {
  const [tab, setTab] = useState<'liquidity' | 'hooks' | 'tools'>('liquidity')
  return (
    <div className="app">
      <h1>V4 LP Manager</h1>
      <div className="main-tabs">
        <button className={tab === 'liquidity' ? 'active' : ''} onClick={() => setTab('liquidity')}>
          Add Liquidity
        </button>
        <button className={tab === 'hooks' ? 'active' : ''} onClick={() => setTab('hooks')}>
          Hook Manager
        </button>
        <button className={tab === 'tools' ? 'active' : ''} onClick={() => setTab('tools')}>
          Tools
        </button>
      </div>
      {/* FIX: 用 CSS display:none 代替条件渲染，切换 tab 时组件不卸载，
          进行中的交易状态（txHash、activeStep）不会丢失，避免用户误以为交易未发送而重复提交。 */}
      {/* FIX: ConnectButton 提取到 tab 外部共享，避免 display:none 下两个实例同时挂载
          各自独立发起 useBalance 等 RPC 请求，浪费带宽并可能触发公共 RPC 限速。 */}
      {tab !== 'tools' && <ConnectButton />}
      <div style={{ display: tab === 'liquidity' ? 'block' : 'none' }}>
        <AddLiquidity />
      </div>
      <div style={{ display: tab === 'hooks' ? 'block' : 'none' }}>
        <HookManager />
      </div>
      <div style={{ display: tab === 'tools' ? 'block' : 'none' }}>
        <Tools />
      </div>
      <footer className="app-footer">build {__COMMIT_HASH__}</footer>
    </div>
  )
}

export default App
