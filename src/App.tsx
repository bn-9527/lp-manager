import { useState } from 'react'
import ConnectButton from './components/ConnectButton'
import AddLiquidity from './components/AddLiquidity'
import Tools from './components/Tools'
import './App.css'

declare const __COMMIT_HASH__: string

function App() {
  const [tab, setTab] = useState<'liquidity' | 'tools'>('liquidity')
  return (
    <div className="app">
      <h1>V4 LP Manager</h1>
      <div className="main-tabs">
        <button className={tab === 'liquidity' ? 'active' : ''} onClick={() => setTab('liquidity')}>
          Add Liquidity
        </button>
        <button className={tab === 'tools' ? 'active' : ''} onClick={() => setTab('tools')}>
          Tools
        </button>
      </div>
      {tab === 'liquidity' && (
        <>
          <ConnectButton />
          <AddLiquidity />
        </>
      )}
      {tab === 'tools' && <Tools />}
      <footer className="app-footer">build {__COMMIT_HASH__}</footer>
    </div>
  )
}

export default App
