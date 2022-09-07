import { BI_MAX_UINT256 } from '../../../bigint-constants';
import { _require } from '../../../utils';
import { sqrt } from './utils';

export class FullMath {
  static mulDiv(a: bigint, b: bigint, denominator: bigint) {
    const result = (a * b) / denominator;

    _require(
      result <= BI_MAX_UINT256,
      '',
      { result, BI_MAX_UINT: BI_MAX_UINT256 },
      'result <= BI_MAX_UINT',
    );

    return result;
  }

  static mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint) {
    const result = (a * b + denominator - 1n) / denominator;

    _require(
      result <= BI_MAX_UINT256,
      '',
      { result, BI_MAX_UINT: BI_MAX_UINT256 },
      'result <= BI_MAX_UINT',
    );

    return result;
  }

  public static getSmallerRootOfQuadEqn(
    a: bigint,
    b: bigint,
    c: bigint,
  ): bigint {
    // smallerRoot = (b - sqrt(b * b - a * c)) / a;
    const tmp1 = b * b;
    const tmp2 = a * c;
    const tmp3 = sqrt(tmp1 - tmp2);
    const tmp4 = b - tmp3;
    return tmp4 / a;
  }
}
