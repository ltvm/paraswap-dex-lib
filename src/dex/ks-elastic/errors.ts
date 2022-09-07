export class PoolNotFoundError extends Error {
  constructor(token1: string, token2: string, feeTier: number) {
    const errMsg = `Pool is not existed with token1=${token1}, token2=${token2}, fee=${feeTier}`;
    super(errMsg);
    this.name = 'PoolNotFoundError';
  }
}
