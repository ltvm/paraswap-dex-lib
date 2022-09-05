import _ from 'lodash';
import { PoolState, Slot0, TickInfo } from '../types';
import { LiquidityMath } from './LiquidityMath';
import { ZERO } from '../internal-constants';
import { SqrtPriceMath } from './SqrtPriceMath';
import { SwapMath } from './SwapMath';
import { TickList } from './TickList';

import { TickMath } from './TickMath';
import { _require } from '../utils';
import { DeepReadonly } from 'ts-essentials';
import { NumberAsString, SwapSide } from 'paraswap-core';
import { OUT_OF_RANGE_ERROR_POSTFIX } from '../constants';
import { setImmediatePromise } from '../utils';

type ModifyPositionParams = {
  tickLower: bigint;
  tickUpper: bigint;
  liquidityDelta: bigint;
};

type PriceComputationState = {
  amountSpecifiedRemaining: bigint;
  amountCalculated: bigint;
  sqrtPriceX96: bigint;
  tick: bigint;
  protocolFee: bigint;
  liquidity: bigint;
  isFirstCycleState: boolean;
};

type PriceComputationCache = {
  liquidityStart: bigint;
  // blockTimestamp: bigint;
  feeProtocol: bigint;
  secondsPerLiquidityCumulativeX128: bigint;
  tickCumulative: bigint;
  computedLatestObservation: boolean;
};

function _updatePriceComputationObjects<
  T extends PriceComputationState | PriceComputationCache,
>(toUpdate: T, updateBy: T) {
  for (const k of Object.keys(updateBy) as (keyof T)[]) {
    toUpdate[k] = updateBy[k];
  }
}

async function _priceComputationCycles(
  poolState: DeepReadonly<PoolState>,
  ticksCopy: Record<NumberAsString, TickInfo>,
  state: PriceComputationState,
  cache: PriceComputationCache,
  sqrtPriceLimitX96: bigint,
  zeroForOne: boolean,
  exactInput: boolean,
): Promise<
  [
    // result
    PriceComputationState,
    // Latest calculated full cycle state we can use for bigger amounts
    {
      latestFullCycleState: PriceComputationState;
      latestFullCycleCache: PriceComputationCache;
    },
  ]
> {
  const latestFullCycleState: PriceComputationState = { ...state };
  const latestFullCycleCache: PriceComputationCache = { ...cache };

  // We save tick before any change. Later we use this to restore
  // state before last step
  let lastTicksCopy: { index: number; tick: TickInfo } | undefined;
  const tickList = initTickList(poolState.ticks);

  while (
    state.amountSpecifiedRemaining !== 0n &&
    state.sqrtPriceX96 !== sqrtPriceLimitX96
  ) {
    const step = {
      sqrtPriceStartX96: 0n,
      tickNext: 0n,
      initialized: false,
      sqrtPriceNextX96: 0n,
      amountIn: 0n,
      amountOut: 0n,
      feeAmount: 0n,
    };

    step.sqrtPriceStartX96 = state.sqrtPriceX96;

    try {
      const result = TickList.nextInitializedTickWithinFixedDistance(
        tickList,
        Number(state.tick),
        zeroForOne,
        480,
      );
      step.tickNext = BigInt(result[0]);
      step.initialized = result[1];
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.endsWith(OUT_OF_RANGE_ERROR_POSTFIX)
      ) {
        state.amountSpecifiedRemaining = 0n;
        state.amountCalculated = 0n;
        break;
      }
      throw e;
    }

    if (step.tickNext < TickMath.MIN_TICK) {
      step.tickNext = TickMath.MIN_TICK;
    } else if (step.tickNext > TickMath.MAX_TICK) {
      step.tickNext = TickMath.MAX_TICK;
    }

    step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

    const [sqrtPriceX96, amountIn, amountOut, deltaL] =
      SwapMath.computeSwapStepPromm(
        state.sqrtPriceX96,
        (
          zeroForOne
            ? step.sqrtPriceNextX96 < sqrtPriceLimitX96
            : step.sqrtPriceNextX96 > sqrtPriceLimitX96
        )
          ? sqrtPriceLimitX96
          : step.sqrtPriceNextX96,
        state.liquidity + poolState.reinvestLiquidity,
        state.amountSpecifiedRemaining,
        poolState.fee,
        exactInput,
        zeroForOne,
      );

    state.sqrtPriceX96 = sqrtPriceX96;
    step.amountIn = amountIn;
    step.amountOut = amountOut;
    step.feeAmount = deltaL;

    if (exactInput) {
      state.amountSpecifiedRemaining -= step.amountIn + step.feeAmount;
      state.amountCalculated = state.amountCalculated - step.amountOut;
    } else {
      state.amountSpecifiedRemaining += step.amountOut;
      state.amountCalculated =
        state.amountCalculated + step.amountIn + step.feeAmount;
    }

    if (cache.feeProtocol > 0n) {
      const delta = step.feeAmount / cache.feeProtocol;
      step.feeAmount -= delta;
      state.protocolFee += delta;
    }

    if (state.sqrtPriceX96 === step.sqrtPriceNextX96) {
      if (step.initialized) {
        if (state.amountSpecifiedRemaining === 0n) {
          const castTickNext = Number(step.tickNext);
          lastTicksCopy = {
            index: castTickNext,
            tick: { ...ticksCopy[castTickNext] },
          };
        }

        let liquidityNet = TickList.getTick(
          tickList,
          Number(step.tickNext),
        ).liquidityNet;

        if (zeroForOne) liquidityNet = -liquidityNet;

        state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
      }

      state.tick = zeroForOne ? step.tickNext - 1n : step.tickNext;
    } else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
      state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
    }

    if (state.amountSpecifiedRemaining !== 0n) {
      _updatePriceComputationObjects(latestFullCycleState, state);
      _updatePriceComputationObjects(latestFullCycleCache, cache);
      // If it last cycle, check if ticks were changed and then restore previous state
      // for next calculations
    } else if (lastTicksCopy !== undefined) {
      ticksCopy[lastTicksCopy.index] = lastTicksCopy.tick;
    }
  }

  await setImmediatePromise();

  return [state, { latestFullCycleState, latestFullCycleCache }];
}

class KsElasticMath {
  async queryOutputs(
    poolState: DeepReadonly<PoolState>,
    // Amounts must increase
    amounts: bigint[],
    zeroForOne: boolean,
    side: SwapSide,
  ): Promise<bigint[]> {
    const isSell = side === SwapSide.SELL;

    // While calculating, ticks are changing, so to not change the actual state,
    // we use copy
    const ticksCopy = _.cloneDeep(poolState.ticks);

    const sqrtPriceLimitX96 = zeroForOne
      ? TickMath.MIN_SQRT_RATIO + 1n
      : TickMath.MAX_SQRT_RATIO - 1n;

    const cache: PriceComputationCache = {
      liquidityStart: poolState.liquidity,
      // blockTimestamp: this._blockTimestamp(poolState),
      feeProtocol: zeroForOne
        ? BigInt(poolState.fee) % 16n
        : BigInt(poolState.fee) >> 4n,
      secondsPerLiquidityCumulativeX128: 0n,
      tickCumulative: 0n,
      computedLatestObservation: false,
    };

    const state: PriceComputationState = {
      // Will be overwritten later
      amountSpecifiedRemaining: 0n,
      amountCalculated: 0n,
      sqrtPriceX96: poolState.sqrtPriceX96,
      tick: poolState.currentTick,
      protocolFee: 0n,
      liquidity: cache.liquidityStart,
      isFirstCycleState: true,
    };

    let isOutOfRange = false;
    let previousAmount = 0n;

    const outputs = new Array(amounts.length);
    for (const [i, amount] of amounts.entries()) {
      if (amount === 0n) {
        outputs[i] = 0n;
        continue;
      }

      const amountSpecified = isSell
        ? BigInt.asIntN(256, amount)
        : -BigInt.asIntN(256, amount);

      if (state.isFirstCycleState) {
        // Set first non zero amount
        state.amountSpecifiedRemaining = amountSpecified;
        state.isFirstCycleState = false;
      } else {
        state.amountSpecifiedRemaining =
          amountSpecified - (previousAmount - state.amountSpecifiedRemaining);
      }

      const exactInput = amountSpecified > 0n;

      _require(
        zeroForOne
          ? sqrtPriceLimitX96 < poolState.sqrtPriceX96 &&
              sqrtPriceLimitX96 > TickMath.MIN_SQRT_RATIO
          : sqrtPriceLimitX96 > poolState.sqrtPriceX96 &&
              sqrtPriceLimitX96 < TickMath.MAX_SQRT_RATIO,
        'SPL',
        { zeroForOne, sqrtPriceLimitX96 },
        'zeroForOne ? sqrtPriceLimitX96 < slot0Start.sqrtPriceX96 && sqrtPriceLimitX96 > TickMath.MIN_SQRT_RATIO : sqrtPriceLimitX96 > slot0Start.sqrtPriceX96 && sqrtPriceLimitX96 < TickMath.MAX_SQRT_RATIO',
      );

      if (!isOutOfRange) {
        const [finalState, { latestFullCycleState, latestFullCycleCache }] =
          await _priceComputationCycles(
            poolState,
            ticksCopy,
            state,
            cache,
            sqrtPriceLimitX96,
            zeroForOne,
            exactInput,
          );

        if (
          finalState.amountSpecifiedRemaining === 0n &&
          finalState.amountCalculated === 0n
        ) {
          isOutOfRange = true;
          outputs[i] = 0n;
          continue;
        }

        // We use it on next step to correct state.amountSpecifiedRemaining
        previousAmount = amountSpecified;

        // First extract calculated values
        const [amount0, amount1] =
          zeroForOne === exactInput
            ? [
                amountSpecified - finalState.amountSpecifiedRemaining,
                finalState.amountCalculated,
              ]
            : [
                finalState.amountCalculated,
                amountSpecified - finalState.amountSpecifiedRemaining,
              ];

        // Update for next amount
        _updatePriceComputationObjects(state, latestFullCycleState);
        _updatePriceComputationObjects(cache, latestFullCycleCache);

        if (isSell) {
          outputs[i] = BigInt.asUintN(256, -(zeroForOne ? amount1 : amount0));
          continue;
        } else {
          outputs[i] = zeroForOne
            ? BigInt.asUintN(256, amount0)
            : BigInt.asUintN(256, amount1);
          continue;
        }
      } else {
        outputs[i] = 0n;
      }
    }

    return outputs;
  }

  swapFromEvent(
    poolState: PoolState,
    amountSpecified: bigint,
    newSqrtPriceX96: bigint,
    newTick: bigint,
    newLiquidity: bigint,
    zeroForOne: boolean,
  ): void {
    const tickList = initTickList(poolState.ticks);
    const cache = {
      liquidityStart: poolState.liquidity,
      feeProtocol: 0n,
      secondsPerLiquidityCumulativeX128: 0n,
      tickCumulative: 0n,
      computedLatestObservation: false,
    };

    const state = {
      // Because I don't have the exact amount user used, set this number to MAX_NUMBER to proceed
      // with calculations. I think it is not a problem since in loop I don't rely on this value
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: 0n,
      sqrtPriceX96: poolState.sqrtPriceX96,
      tick: poolState.currentTick,
      protocolFee: 0n,
      liquidity: cache.liquidityStart,
      reinvestL: poolState.reinvestLiquidity,
      fee: poolState.fee,
      tickList: tickList,
    };
    const exactInput = amountSpecified >= ZERO;

    // Because I didn't have all variables, adapted loop stop with state.tick !== newTick
    // condition. This cycle need only to calculate Tick.cross() function values
    // It means that we are interested in cycling only if state.tick !== newTick
    // When they become equivalent, we proceed with state updating part as normal
    // And if assumptions regarding this cycle are correct, we don't need to process
    // the last cycle when state.tick === newTick
    while (state.tick !== newTick && state.sqrtPriceX96 !== newSqrtPriceX96) {
      const step = {
        sqrtPriceStartX96: 0n,
        tickNext: 0n,
        initialized: false,
        sqrtPriceNextX96: 0n,
        amountIn: 0n,
        amountOut: 0n,
        feeAmount: 0n,
        deltaL: 0n,
      };

      step.sqrtPriceStartX96 = state.sqrtPriceX96;

      const result = TickList.nextInitializedTickWithinFixedDistance(
        state.tickList,
        Number(state.tick),
        zeroForOne,
        480,
      );

      step.tickNext = BigInt(result[0]);
      step.initialized = result[1];

      if (step.tickNext < TickMath.MIN_TICK) {
        step.tickNext = TickMath.MIN_TICK;
      } else if (step.tickNext > TickMath.MAX_TICK) {
        step.tickNext = TickMath.MAX_TICK;
      }

      step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

      [state.sqrtPriceX96, step.amountIn, step.amountOut, step.deltaL] =
        SwapMath.computeSwapStepPromm(
          state.sqrtPriceX96,
          (
            zeroForOne
              ? step.sqrtPriceNextX96 < newSqrtPriceX96
              : step.sqrtPriceNextX96 > newSqrtPriceX96
          )
            ? newSqrtPriceX96
            : step.sqrtPriceNextX96,
          state.liquidity + state.reinvestL,
          state.amountSpecifiedRemaining,
          poolState.fee,
          exactInput,
          zeroForOne,
        );
      console.log('sqrtPriceNextX96.sqrtPriceNextX96', step.sqrtPriceNextX96);
      console.log('sqrtPriceNextX96.sqrtPriceNextX96', step.sqrtPriceNextX96);
      state.amountSpecifiedRemaining =
        state.amountSpecifiedRemaining - step.amountIn;
      state.amountCalculated = state.amountCalculated + step.amountOut;
      state.reinvestL = state.reinvestL + step.deltaL;
      if (state.sqrtPriceX96 == step.sqrtPriceNextX96) {
        if (step.initialized) {
          let liquidityNet = TickList.getTick(
            state.tickList,
            Number(step.tickNext),
          ).liquidityNet;
          if (zeroForOne) liquidityNet = -liquidityNet;
          state.liquidity = LiquidityMath.addDelta(
            state.liquidity,
            liquidityNet,
          );
        }

        state.tick = zeroForOne ? step.tickNext - 1n : step.tickNext;
      } else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
        state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
      }
    }

    if (poolState.currentTick !== newTick) {
      [poolState.sqrtPriceX96, poolState.currentTick] = [
        newSqrtPriceX96,
        newTick,
      ];
    } else {
      poolState.sqrtPriceX96 = newSqrtPriceX96;
    }

    if (poolState.liquidity !== newLiquidity)
      poolState.liquidity = newLiquidity;
  }

  _modifyPosition(
    state: PoolState,
    params: ModifyPositionParams,
  ): [bigint, bigint] {
    this.checkTicks(params.tickLower, params.tickUpper);

    let amount0 = 0n;
    let amount1 = 0n;
    if (params.liquidityDelta !== 0n) {
      if (state.currentTick < params.tickLower) {
        amount0 = SqrtPriceMath._getAmount0DeltaO(
          TickMath.getSqrtRatioAtTick(params.tickLower),
          TickMath.getSqrtRatioAtTick(params.tickUpper),
          params.liquidityDelta,
        );
      } else if (state.currentTick < params.tickUpper) {
        const liquidityBefore = state.liquidity;

        amount0 = SqrtPriceMath._getAmount0DeltaO(
          state.sqrtPriceX96,
          TickMath.getSqrtRatioAtTick(params.tickUpper),
          params.liquidityDelta,
        );
        amount1 = SqrtPriceMath._getAmount1DeltaO(
          TickMath.getSqrtRatioAtTick(params.tickLower),
          state.sqrtPriceX96,
          params.liquidityDelta,
        );

        state.liquidity = LiquidityMath.addDelta(
          liquidityBefore,
          params.liquidityDelta,
        );
      } else {
        amount1 = SqrtPriceMath._getAmount1DeltaO(
          TickMath.getSqrtRatioAtTick(params.tickLower),
          TickMath.getSqrtRatioAtTick(params.tickUpper),
          params.liquidityDelta,
        );
      }
    }
    return [amount0, amount1];
  }

  private checkTicks(tickLower: bigint, tickUpper: bigint) {
    _require(
      tickLower < tickUpper,
      'TLU',
      { tickLower, tickUpper },
      'tickLower < tickUpper',
    );
    _require(
      tickLower >= TickMath.MIN_TICK,
      'TLM',
      { tickLower },
      'tickLower >= TickMath.MIN_TICK',
    );
    _require(
      tickUpper <= TickMath.MAX_TICK,
      'TUM',
      { tickUpper },
      'tickUpper <= TickMath.MAX_TICK',
    );
  }
}

function initTickList(ticks: Record<NumberAsString, TickInfo>): TickInfo[] {
  return Object.keys(ticks)
    .map(function (tickIndex) {
      let tickInfo = ticks[tickIndex];
      return tickInfo;
    })
    .sort((tick1, tick2) => tick1.index - tick2.index);
}
export const ksElasticMath = new KsElasticMath();
