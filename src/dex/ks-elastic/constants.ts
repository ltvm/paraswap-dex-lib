export const KS_ELASTIC_QUOTE_GASLIMIT = 200_000;

// This is used for price calculation. If out of scope, return 0n
export const TICK_BITMAP_TO_USE = 4n;

// This is used to check if the state is still valid.
export const TICK_BITMAP_BUFFER = 8n;

export const KS_ELASTIC_SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-mainnet';

export const KS_ELASTIC_EFFICIENCY_FACTOR = 5;

export const ZERO_TICK_INFO = {
  liquidityGross: 0n,
  liquidityNet: 0n,
  tickCumulativeOutside: 0n,
  secondsPerLiquidityOutsideX128: 0n,
  secondsOutside: 0n,
  index: 0,
  initialized: false,
};

export const ZERO_ORACLE_OBSERVATION = {
  blockTimestamp: 0n,
  tickCumulative: 0n,
  secondsPerLiquidityCumulativeX128: 0n,
  initialized: false,
};

export const OUT_OF_RANGE_ERROR_POSTFIX = `INVALID_TICK_BIT_MAP_RANGES`;

/**
 * The default factory enabled fee amounts, denominated in hundredths of bips.
 */
export enum FeeAmount {
  STABLE = 8,
  LOWEST = 4,
  LOW = 40,
  MEDIUM = 300,
  HIGH = 1000,
}

export function ToFeeAmount(fee: number): FeeAmount {
  switch (fee) {
    case 8:
      return FeeAmount.STABLE;
    case 4:
      return FeeAmount.LOWEST;
    case 40:
      return FeeAmount.LOW;
    case 300:
      return FeeAmount.MEDIUM;
    case 1000:
      return FeeAmount.HIGH;
    default:
      throw Error('fee is not supported');
  }
}

const TICK_SPACING = {
  [FeeAmount.LOWEST]: 1,
  [FeeAmount.STABLE]: 1,
  [FeeAmount.LOW]: 8,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
};

export const TickSpacing = TICK_SPACING;

export const PoolAddressNotExisted =
  '0x0000000000000000000000000000000000000000';
