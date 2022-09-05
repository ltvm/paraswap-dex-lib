import { DexParams } from './types';
import { DexConfigMap, AdapterMappings } from '../../types';
import { Network, SwapSide } from '../../constants';
import { FeeAmount } from './constants';

import { Address } from 'paraswap';

// const SUPPORTED_FEES = [FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW, FeeAmount.STABLE, FeeAmount.LOWEST];
const SUPPORTED_FEES = [FeeAmount.MEDIUM];

// Pools tha will be initialized on app startup
// They are added for testing
export const PoolsToPreload: DexConfigMap<
  { token0: Address; token1: Address }[]
> = {
  KsElastic: {
    [Network.POLYGON]: [
      {
        token0: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'.toLowerCase(),
        token1: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'.toLowerCase(),
      },
      {
        token0: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'.toLowerCase(),
        token1: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'.toLowerCase(),
      },
    ],
    [Network.MAINNET]: [
      {
        token0: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'.toLowerCase(),
        token1: '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase(),
      },
    ],
  },
};

export const KsElasticConfig: DexConfigMap<DexParams> = {
  KsElastic: {
    [Network.MAINNET]: {
      factory: '0x5F1dddbf348aC2fbe22a163e30F99F9ECE3DD50a',
      router: '0xC1e7dFE73E1598E3910EF4C7845B68A9Ab6F4c83',
      supportedFees: SUPPORTED_FEES,
      tickReader: '0x165c68077ac06c83800d19200e6E2B08D02dE75D',
      multiCall: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    },
    // [Network.POLYGON]: {
    //   factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    //   router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    //   supportedFees: SUPPORTED_FEES,
    //   tickReader: '0x6Dc993Fe1e945A640576B4Dca81281d8e998DF71',
    // },
  },
};

export const Adapters: Record<number, AdapterMappings> = {
  [Network.MAINNET]: {
    [SwapSide.SELL]: [{ name: 'Adapter01', index: 6 }],
    [SwapSide.BUY]: [{ name: 'BuyAdapter', index: 2 }],
  },
  [Network.POLYGON]: {
    [SwapSide.SELL]: [{ name: 'PolygonAdapter01', index: 13 }],
    [SwapSide.BUY]: [{ name: 'PolygonBuyAdapter', index: 2 }],
  },
};
