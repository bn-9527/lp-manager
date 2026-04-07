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
      56: '0xB0b313A71F597079505243564F139030fA93a31c',
    },
    abi: [...sharedManagementAbi, ...clInitializePoolAbi],
    needsPoolManager: true,
  },
  'uni-v4': {
    protocol: 'uni-v4',
    label: 'Uni V4',
    defaultAddresses: {
      56: '0xB0b05d1e6e848FAD0D2E4798e1e880a1F0300B0b',
      8453: '0xB0b98a79A2448F8E1C0C8E247dc638685502D0Bb',
    },
    abi: [...sharedManagementAbi, ...v4InitializePoolAbi],
    needsPoolManager: false,
  },
}
