import { FeeAmount } from './constants';
import { NumberAsString } from '../../types';
import { Address } from '../../types';

export type TickInfo = {
  liquidityGross: bigint;
  liquidityNet: bigint;
  tickCumulativeOutside: bigint;
  secondsPerLiquidityOutsideX128: bigint;
  secondsOutside: bigint;
  initialized: boolean;
  index: number;
};

export type Slot0 = {
  sqrtPriceX96: bigint;
  tick: bigint;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: bigint;
};

export type PoolState = {
  tickSpacing: bigint;
  fee: FeeAmount;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  // tickList: TickInfo [];
  ticks: Record<NumberAsString, TickInfo>;
  isValid: boolean;
  reinvestLiquidity: bigint;
  currentTick: bigint;
};

export type KsElasticData = {
  path: {
    tokenIn: Address;
    tokenOut: Address;
    fee: NumberAsString;
  }[];
};

export type DexParams = {
  router: Address;
  factory: Address;
  tickReader: Address;
  supportedFees: FeeAmount[];
  multiCall: Address;
};

export type KsElasticSellParam = {
  path: string;
  recipient: Address;
  deadline: number;
  amountIn: NumberAsString;
  amountOutMinimum: NumberAsString;
};

export type KsElasticBuyParam = {
  path: string;
  recipient: Address;
  deadline: number;
  amountOut: NumberAsString;
  amountInMaximum: NumberAsString;
};

export type KsElasticParam = KsElasticSellParam | KsElasticBuyParam;

export enum KsElasticFunctions {
  exactInput = 'exactInput',
  exactOutput = 'exactOutput',
}

export type TickInfoMappings = {
  index: number;
  value: TickInfo;
};

export type TickBitMapMappings = {
  index: number;
  value: bigint;
};
