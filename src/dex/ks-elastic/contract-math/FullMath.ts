// import { BI_MAX_UINT256 } from '../../../bigint-constants';
import { _require } from '../../../utils';
import { sqrt } from './utils';
import { bigIntify } from '../utils';

export class FullMath {
  static mulDiv(a: bigint, b: bigint, denominator: bigint) {
    const result = bigIntify(a * bigIntify(b)) / bigIntify(denominator);

    // _require(
    //   result <= BI_MAX_UINT256,
    //   '',
    //   { result, BI_MAX_UINT: BI_MAX_UINT256 },
    //   'result <= BI_MAX_UINT',
    // );

    return result;
  }

  static mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint) {
    const result = bigIntify(a * b + denominator - 1n) / bigIntify(denominator);

    // _require(
    //   result <= BI_MAX_UINT256,
    //   '',
    //   { result, BI_MAX_UINT: BI_MAX_UINT256 },
    //   'result <= BI_MAX_UINT',
    // );

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
    if (tmp1 - tmp2 < 0n) {
      return 0n;
    }
    const tmp3 = sqrt(tmp1 - tmp2);
    const tmp4 = b - tmp3;
    return tmp4 / a;
  }
}
