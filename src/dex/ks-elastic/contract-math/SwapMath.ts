import { FeeAmount } from '../constants';

import { FullMath } from './FullMath';
import { Q96, ZERO } from '../internal-constants';
import { bigIntify } from '../utils';

const BPS = 1000000n;
const TWO_BPS = BPS + BPS;

export class SwapMath {
  public static computeSwapStepPromm(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: FeeAmount,
    exactIn: boolean,
    zeroForOne: boolean,
  ): [bigint, bigint, bigint, bigint] {
    const returnValues = {
      sqrtRatioNextX96: 0n,
      amountIn: 0n,
      amountOut: 0n,
      deltaL: 0n,
    };
    if (sqrtRatioCurrentX96 == sqrtRatioTargetX96)
      return [sqrtRatioCurrentX96, 0n, 0n, 0n];
    let usedAmount = SwapMath.calcReachAmount(
      sqrtRatioCurrentX96,
      sqrtRatioTargetX96,
      liquidity,
      feePips,
      exactIn,
      zeroForOne,
    );
    if (
      (exactIn && usedAmount >= amountRemaining) ||
      (!exactIn && usedAmount <= amountRemaining)
    ) {
      usedAmount = amountRemaining;
    } else {
      returnValues.sqrtRatioNextX96 = sqrtRatioTargetX96;
    }
    returnValues.amountIn = usedAmount;

    const absUsedAmount = usedAmount >= 0n ? usedAmount : -usedAmount;

    if (returnValues.sqrtRatioNextX96 == 0n) {
      //last step
      returnValues.deltaL = SwapMath.estimateIncrementalLiquidity(
        absUsedAmount,
        liquidity,
        sqrtRatioCurrentX96,
        feePips,
        exactIn,
        zeroForOne,
      );

      returnValues.sqrtRatioNextX96 = SwapMath.calcFinalPrice(
        absUsedAmount,
        liquidity,
        returnValues.deltaL,
        sqrtRatioCurrentX96,
        exactIn,
        zeroForOne,
      );
    } else {
      returnValues.deltaL = SwapMath.calcIncrementalLiquidity(
        sqrtRatioCurrentX96,
        sqrtRatioTargetX96,
        liquidity,
        absUsedAmount,
        exactIn,
        zeroForOne,
      );
    }
    returnValues.amountOut = SwapMath.calcReturnedAmount(
      sqrtRatioCurrentX96,
      returnValues.sqrtRatioNextX96,
      liquidity,
      returnValues.deltaL,
      exactIn,
      zeroForOne,
    );
    return [
      returnValues.sqrtRatioNextX96,
      returnValues.amountIn,
      returnValues.amountOut,
      returnValues.deltaL,
    ];
  }

  public static calcReachAmount(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    feePips: FeeAmount,
    exactIn: boolean,
    zeroForOne: boolean,
  ) {
    const absPriceDiff =
      sqrtRatioCurrentX96 >= sqrtRatioTargetX96
        ? sqrtRatioCurrentX96 - sqrtRatioTargetX96
        : sqrtRatioTargetX96 - sqrtRatioCurrentX96;

    let reachAmount;
    if (exactIn) {
      if (zeroForOne) {
        //exactInput + swap 0 -> 1
        const denominator =
          TWO_BPS * sqrtRatioTargetX96 -
          bigIntify(feePips) * sqrtRatioCurrentX96;
        const numerator = FullMath.mulDiv(
          bigIntify(liquidity),
          bigIntify(TWO_BPS * absPriceDiff),
          bigIntify(denominator),
        );
        reachAmount = FullMath.mulDiv(numerator, Q96, sqrtRatioCurrentX96);
      } else {
        //exactInput + swap 1 -> 0
        const denominator =
          TWO_BPS * sqrtRatioCurrentX96 -
          bigIntify(feePips) * sqrtRatioTargetX96;
        const numerator = FullMath.mulDiv(
          liquidity,
          TWO_BPS * absPriceDiff,
          denominator,
        );
        reachAmount = FullMath.mulDiv(numerator, sqrtRatioCurrentX96, Q96);
      }
    } else {
      if (zeroForOne) {
        //exactOut + swap 0 -> 1
        const denominator =
          TWO_BPS * sqrtRatioCurrentX96 -
          bigIntify(feePips) * sqrtRatioTargetX96;
        console.log('denominator', denominator);
        console.log('denominator sqrtRatioCurrentX96', sqrtRatioCurrentX96);

        let numerator = denominator - bigIntify(feePips) * sqrtRatioCurrentX96;
        numerator = FullMath.mulDiv(
          bigIntify(bigIntify(liquidity) << 96n),
          bigIntify(numerator),
          bigIntify(denominator),
        );
        reachAmount =
          FullMath.mulDiv(
            bigIntify(numerator),
            bigIntify(absPriceDiff),
            sqrtRatioCurrentX96,
          ) / sqrtRatioTargetX96;
        reachAmount = -reachAmount;
      } else {
        const denominator =
          TWO_BPS * sqrtRatioTargetX96 -
          bigIntify(feePips) * sqrtRatioCurrentX96;
        let numerator = denominator - bigIntify(feePips) * sqrtRatioTargetX96;
        numerator = FullMath.mulDiv(
          bigIntify(liquidity),
          bigIntify(numerator),
          bigIntify(denominator),
        );
        reachAmount = FullMath.mulDiv(
          bigIntify(numerator),
          bigIntify(absPriceDiff),
          bigIntify(Q96),
        );
        reachAmount = -reachAmount;
      }
    }
    return reachAmount;
  }

  public static calcReturnedAmount(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    deltaL: bigint,
    exactIn: boolean,
    zeroForOne: boolean,
  ): bigint {
    let returnedAmount;
    if (zeroForOne) {
      if (exactIn) {
        returnedAmount =
          FullMath.mulDivRoundingUp(deltaL, sqrtRatioTargetX96, Q96) +
          FullMath.mulDiv(
            bigIntify(liquidity),
            bigIntify(sqrtRatioCurrentX96 - sqrtRatioTargetX96),
            bigIntify(Q96),
          ) *
            BigInt(-1);
      } else {
        returnedAmount =
          FullMath.mulDivRoundingUp(
            bigIntify(deltaL),
            bigIntify(sqrtRatioTargetX96),
            bigIntify(Q96),
          ) +
          FullMath.mulDivRoundingUp(
            bigIntify(liquidity),
            bigIntify(sqrtRatioTargetX96 - sqrtRatioCurrentX96),
            bigIntify(Q96),
          );
      }
    } else {
      returnedAmount =
        FullMath.mulDivRoundingUp(
          bigIntify(liquidity + deltaL),
          bigIntify(Q96),
          bigIntify(sqrtRatioTargetX96),
        ) +
        FullMath.mulDivRoundingUp(
          bigIntify(liquidity),
          bigIntify(Q96),
          bigIntify(sqrtRatioCurrentX96),
        ) *
          BigInt(-1);
    }

    if (exactIn && returnedAmount == 1n) {
      returnedAmount = ZERO;
    }
    return returnedAmount;
  }

  public static calcIncrementalLiquidity(
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    absAmount: bigint,
    exactIn: boolean,
    zeroForOne: boolean,
  ): bigint {
    // this is when we reach the target, then we have target_X96
    if (zeroForOne) {
      const tmp1 = FullMath.mulDiv(liquidity, Q96, sqrtRatioCurrentX96);
      const tmp2 = exactIn ? tmp1 + absAmount : tmp1 - absAmount;
      const tmp3 = FullMath.mulDiv(sqrtRatioTargetX96, tmp2, Q96);
      return tmp3 > liquidity ? tmp3 - liquidity : ZERO;
    } else {
      const tmp1 = FullMath.mulDiv(liquidity, sqrtRatioCurrentX96, Q96);
      const tmp2 = exactIn ? tmp1 + absAmount : tmp1 - absAmount;
      const tmp3 = FullMath.mulDiv(tmp2, Q96, sqrtRatioTargetX96);
      return tmp3 > liquidity ? tmp3 - liquidity : ZERO;
    }
  }

  public static estimateIncrementalLiquidity(
    absAmount: bigint,
    liquidity: bigint,
    sqrtRatioCurrentX96: bigint,
    feePips: FeeAmount,
    exactIn: boolean,
    zeroForOne: boolean,
  ): bigint {
    // this is when we didn't reach the target (last step before loop end), then we have to recalculate the target_X96, deltaL ...
    let deltaL;
    let fee = bigIntify(feePips);
    if (exactIn) {
      if (zeroForOne) {
        // deltaL = feeInBps * absDelta * currentSqrtP / 2
        deltaL = FullMath.mulDiv(
          sqrtRatioCurrentX96,
          absAmount * fee,
          TWO_BPS << BigInt(96),
        );
      } else {
        // deltaL = feeInBps * absDelta * / (currentSqrtP * 2)
        // Because nextSqrtP = (liquidity + absDelta / currentSqrtP) * currentSqrtP / (liquidity + deltaL)
        // so we round down deltaL, to round up nextSqrtP
        deltaL = FullMath.mulDiv(
          Q96,
          absAmount * fee,
          TWO_BPS * sqrtRatioCurrentX96,
        );
      }
    } else {
      // obtain the smaller root of the quadratic equation
      // ax^2 - 2bx + c = 0 such that b > 0, and x denotes deltaL
      let a = fee;
      let b = BPS - fee;
      let c = BigInt(fee) * BigInt(liquidity) * BigInt(absAmount);
      if (zeroForOne) {
        b = b - FullMath.mulDiv(BPS * absAmount, sqrtRatioCurrentX96, Q96);
        c = FullMath.mulDiv(c, sqrtRatioCurrentX96, Q96);
      } else {
        b = b - FullMath.mulDiv(BPS * absAmount, Q96, sqrtRatioCurrentX96);
        c = FullMath.mulDiv(c, Q96, sqrtRatioCurrentX96);
      }
      deltaL = FullMath.getSmallerRootOfQuadEqn(a, b, c);
    }
    return deltaL;
  }

  public static calcFinalPrice(
    absAmount: bigint,
    liquidity: bigint,
    deltaL: bigint,
    sqrtRatioCurrentX96: bigint,
    exactIn: boolean,
    zeroForOne: boolean,
  ): bigint {
    if (zeroForOne) {
      let tmp = FullMath.mulDiv(absAmount, sqrtRatioCurrentX96, Q96);
      if (exactIn) {
        return FullMath.mulDivRoundingUp(
          bigIntify(liquidity + deltaL),
          bigIntify(sqrtRatioCurrentX96),
          bigIntify(liquidity + tmp),
        );
      } else {
        return FullMath.mulDiv(
          bigIntify(bigIntify(liquidity) + bigIntify(deltaL)),
          bigIntify(sqrtRatioCurrentX96),
          bigIntify(bigIntify(liquidity) - bigIntify(tmp)),
        );
      }
    } else {
      let tmp = FullMath.mulDiv(absAmount, Q96, sqrtRatioCurrentX96);
      if (exactIn) {
        return FullMath.mulDiv(
          liquidity + tmp,
          sqrtRatioCurrentX96,
          liquidity + deltaL,
        );
      } else {
        return FullMath.mulDivRoundingUp(
          liquidity - tmp,
          sqrtRatioCurrentX96,
          liquidity + deltaL,
        );
      }
    }
  }
}
