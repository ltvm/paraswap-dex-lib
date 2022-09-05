export function _mulmod(x: bigint, y: bigint, m: bigint): bigint {
  return m === 0n ? 0n : (x * y) % m;
}

export function _lt(x: bigint, y: bigint) {
  return x < y ? 1n : 0n;
}

export function _gt(x: bigint, y: bigint) {
  return x > y ? 1n : 0n;
}

export function sqrt(value: bigint) {
  if (value < 0n) {
    throw 'square root of negative numbers is not supported';
  }

  if (value < 2n) {
    return value;
  }

  function newtonIteration(n: bigint, x0: bigint): bigint {
    const x1 = (n / x0 + x0) >> 1n;
    if (x0 === x1 || x0 === x1 - 1n) {
      return x0;
    }
    return newtonIteration(n, x1);
  }

  return newtonIteration(value, 1n);
}
