import type { Abi } from 'viem'

export type HookProtocol = 'pcs-cl' | 'uni-v4'

export interface HookProtocolConfig {
  protocol: HookProtocol
  label: string
  defaultAddresses: Record<number, string>
  abi: Abi
  needsPoolManager: boolean
}

const sharedManagementAbi = [
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'pendingOwner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'positionManager', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'poolStartedTimestamp', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getPoolId', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'token0', type: 'address' }, { name: 'token1', type: 'address' },
             { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }],
    outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'getPoolOwners', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }], outputs: [{ name: '', type: 'address[]' }] },
  { name: 'isPoolEnabled', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'isPoolStarted', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'isPoolOwner', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'addPoolOwners', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'owners', type: 'address[]' }], outputs: [] },
  { name: 'removePoolOwners', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'owners', type: 'address[]' }], outputs: [] },
  { name: 'setPoolStartTime', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'startTimestamp', type: 'uint256' }], outputs: [] },
  { name: 'setPositionManager', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: '_positionManager', type: 'address' }], outputs: [] },
  { name: 'emergencyWithdraw', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { name: 'emergencyWithdrawERC20Unsafe', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { name: 'emergencyWithdrawERC721', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'transferOwnership', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'newOwner', type: 'address' }], outputs: [] },
  { name: 'acceptOwnership', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
] as const

const clInitializePoolAbi = [
  { name: 'initializePool', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'key', type: 'tuple', components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'hooks', type: 'address' },
        { name: 'poolManager', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'parameters', type: 'bytes32' },
      ]},
      { name: 'startTimestamp', type: 'uint256' },
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    outputs: [{ name: 'tick', type: 'int24' }] },
  { name: 'getPoolKeyParameters', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tickSpacing', type: 'int24' }],
    outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'poolManager', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const

const v4InitializePoolAbi = [
  { name: 'initializePool', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'key', type: 'tuple', components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'hooks', type: 'address' },
      ]},
      { name: 'startTimestamp', type: 'uint256' },
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    outputs: [{ name: 'tick', type: 'int24' }] },
] as const

export const HOOK_CONFIGS: Record<HookProtocol, HookProtocolConfig> = {
  'pcs-cl': {
    protocol: 'pcs-cl',
    label: 'PCS CL',
    defaultAddresses: {
      56: '0xb0bb171D333569CfD28a37F5c5DdDAAa90aD46af',
    },
    abi: [...sharedManagementAbi, ...clInitializePoolAbi] as const,
    needsPoolManager: true,
  },
  'uni-v4': {
    protocol: 'uni-v4',
    label: 'Uni V4',
    // NOTE: V4AlphaHook 已部署到 Base、Arbitrum 和 Ethereum。BSC 尚无部署，
    // 用户需手动输入 hook 地址。contracts.ts 中 BSC 仍标记为支持链,
    // 因为 AddLiquidity（标准 V4 PositionManager 操作）不依赖自定义 hook 地址。
    defaultAddresses: {
      1: '0xB0BbF26A84587E91F9C0fFA5622940c3324e2880',
      8453: '0xB0b24B89dB0dafbE43C5b40226b63A179f592880',
      42161: '0xB0Be14859E2cA735B22E58C52A6F3413454E2880',
    },
    abi: [...sharedManagementAbi, ...v4InitializePoolAbi] as const,
    needsPoolManager: false,
  },
}
