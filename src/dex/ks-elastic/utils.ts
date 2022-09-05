import { DexConfigMap } from '../../types';
import { DexParams } from './types';

export function getKsElasticDexKey(UniswapV3Config: DexConfigMap<DexParams>) {
  const UniswapV3Keys = Object.keys(UniswapV3Config);
  if (UniswapV3Keys.length !== 1) {
    throw new Error(
      `UniswapV3 key in UniswapV3Config is not unique. Update relevant places (optimizer) or fix config issue. Received: ${JSON.stringify(
        UniswapV3Config,
        (_0, value) => (typeof value === 'bigint' ? value.toString() : value),
      )}`,
    );
  }

  return UniswapV3Keys[0].toLowerCase();
}

export function setImmediatePromise() {
  return new Promise<void>(resolve => {
    setImmediate(() => {
      resolve();
    });
  });
}

export function _require(
  b: boolean,
  message: string,
  values?: Record<string, unknown>,
  condition?: string,
): void {
  let receivedValues = '';
  if (values && condition) {
    const keyValueStr = Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    receivedValues = `Values: ${keyValueStr}. Condition: ${condition} violated`;
  }
  if (!b)
    throw new Error(
      `${receivedValues}. Error message: ${message ? message : 'undefined'}`,
    );
}

export const bigIntify = (val: any) => BigInt(val);

export const stringify = (val: any) => val.toString();
