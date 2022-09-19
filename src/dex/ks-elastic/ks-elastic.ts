import { Interface } from '@ethersproject/abi';
import _ from 'lodash';
import { pack } from '@ethersproject/solidity';
import {
  Token,
  Address,
  ExchangePrices,
  AdapterExchangeParam,
  SimpleExchangeParam,
  PoolLiquidity,
  Logger,
  NumberAsString,
} from '../../types';
import { SwapSide, Network } from '../../constants';
import {
  getBigIntPow,
  getDexKeysWithNetwork,
  wrapETH,
  bigIntify,
} from '../../utils';
import { IDex } from '../../dex/idex';
import { IDexHelper } from '../../dex-helper/idex-helper';
import {
  DexParams,
  PoolState,
  KsElasticData,
  KsElasticFunctions,
  KsElasticParam,
} from './types';
import { SimpleExchange } from '../simple-exchange';
import { KsElasticConfig, Adapters, PoolsToPreload } from './config';
import { KsElasticEventPool } from './ks-elastic-pool';
import KsElasticRouterABI from '../../abi/ks-elastic/Router.json';

import {
  KS_ELASTIC_EFFICIENCY_FACTOR,
  KS_ELASTIC_QUOTE_GASLIMIT,
  KS_ELASTIC_SUBGRAPH_URL,
  FeeAmount,
  ToFeeAmount,
} from './constants';
import { DeepReadonly } from 'ts-essentials';
import { ksElasticMath } from './contract-math/ks-elastic-math';
import { resolve } from 'path';
import { Data } from '../aave-v3/types';
import { PoolNotFoundError } from './errors';

export class KsElastic
  extends SimpleExchange
  implements IDex<KsElasticData, KsElasticParam>
{
  readonly eventPools: Record<string, KsElasticEventPool | null> = {};

  readonly hasConstantPriceLargeAmounts = false;
  readonly needWrapNative = true;

  public static dexKeysWithNetwork: { key: string; networks: Network[] }[] =
    getDexKeysWithNetwork(KsElasticConfig);

  logger: Logger;

  constructor(
    protected network: Network,
    protected dexKey: string,
    protected dexHelper: IDexHelper,
    protected adapters = Adapters[network] || {},
    readonly routerIface = new Interface(KsElasticRouterABI),
    protected config = KsElasticConfig[dexKey][network],
    protected poolsToPreload = PoolsToPreload[dexKey][network] || [],
  ) {
    super(dexHelper.config.data.augustusAddress, dexHelper.web3Provider);
    this.logger = dexHelper.getLogger(dexKey);

    // To receive revert reasons
    this.dexHelper.web3Provider.eth.handleRevert = false;

    // Normalise once all config addresses and use across all scenarios
    this.config = this._toLowerForAllConfigAddresses();
  }

  get supportedFees() {
    return this.config.supportedFees;
  }

  getAdapters(side: SwapSide): { name: string; index: number }[] | null {
    return this.adapters[side] ? this.adapters[side] : null;
  }

  getPoolIdentifier(srcAddress: Address, destAddress: Address, fee: bigint) {
    const tokenAddresses = this._sortTokens(srcAddress, destAddress).join('_');
    return `${this.dexKey}_${tokenAddresses}_${fee}`;
  }

  async initializePricing(blockNumber: number) {
    // This is only for testing, because cold pool fetching is goes out of
    // FETCH_POOL_IDENTIFIER_TIMEOUT range
    await Promise.all(
      this.poolsToPreload.map(async pool =>
        Promise.all(
          this.config.supportedFees.map(async fee =>
            this.getPool(pool.token0, pool.token1, fee, blockNumber),
          ),
        ),
      ),
    );
  }

  async getPool(
    srcAddress: Address,
    destAddress: Address,
    fee: FeeAmount,
    blockNumber: number,
  ): Promise<KsElasticEventPool | null> {
    let pool =
      this.eventPools[
        this.getPoolIdentifier(srcAddress, destAddress, bigIntify(Number(fee)))
      ];
    if (pool === undefined) {
      const [token0, token1] = this._sortTokens(srcAddress, destAddress);

      pool = new KsElasticEventPool(
        this.dexKey,
        this.network,
        this.dexHelper,
        this.logger,
        this.config.tickReader,
        this.config.factory,
        fee,
        token0,
        token1,
        this.config.multiCall,
        0n,
      );

      let newState;
      try {
        newState = await pool.generateState(blockNumber);

        pool.setState(newState, blockNumber);
        this.dexHelper.blockManager.subscribeToLogs(
          pool,
          pool.addressesSubscribed,
          blockNumber,
        );
      } catch (e) {
        if (e instanceof PoolNotFoundError) {
          // Pool does not exist for this feeCode, so we can set it to null
          // to prevent more requests for this pool
          pool = null;
          this.logger.trace(
            `${this.dexHelper}: Pool: srcAddress=${srcAddress}, destAddress=${destAddress}, fee=${fee} not found`,
            e,
          );
        } else {
          // Unexpected Error. Break execution. Do not save the pool in this.eventPools
          this.logger.error(
            `${this.dexKey}: Can not generate pool state for srcAddress=${srcAddress}, destAddress=${destAddress}, fee=${fee} pool`,
            e,
          );
          return null;
        }
      }

      this.eventPools[
        this.getPoolIdentifier(srcAddress, destAddress, bigIntify(Number(fee)))
      ] = pool;
    }
    return pool;
  }

  async getPoolIdentifiers(
    srcToken: Token,
    destToken: Token,
    side: SwapSide,
    blockNumber: number,
  ): Promise<string[]> {
    const _srcToken = wrapETH(srcToken, this.network);
    const _destToken = wrapETH(destToken, this.network);

    const [_srcAddress, _destAddress] = this._getLoweredAddresses(
      _srcToken,
      _destToken,
    );

    if (_srcAddress === _destAddress) return [];

    const pools = (
      await Promise.all(
        this.supportedFees.map(async fee =>
          this.getPool(_srcAddress, _destAddress, fee, blockNumber),
        ),
      )
    ).filter(pool => pool);

    if (pools.length === 0) return [];
    return pools.map(pool => {
      var fee = 0n;
      if (pool !== null) {
        fee = BigInt(pool.fee);
      }
      return this.getPoolIdentifier(_srcAddress, _destAddress, fee);
    });
  }

  async getPricesVolume(
    srcToken: Token,
    destToken: Token,
    amounts: bigint[],
    side: SwapSide,
    blockNumber: number,
    limitPools?: string[],
  ): Promise<null | ExchangePrices<KsElasticData>> {
    try {
      const _srcToken = wrapETH(srcToken, this.network);
      const _destToken = wrapETH(destToken, this.network);

      const [_srcAddress, _destAddress] = this._getLoweredAddresses(
        _srcToken,
        _destToken,
      );

      if (_srcAddress === _destAddress) return null;

      let selectedPools: KsElasticEventPool[] = [];
      if (limitPools === undefined) {
        selectedPools = (
          await Promise.all(
            this.supportedFees.map(async fee =>
              this.getPool(_srcAddress, _destAddress, fee, blockNumber),
            ),
          )
        ).filter(pool => pool) as KsElasticEventPool[];
      } else {
        const pairIdentifierWithoutFee = this.getPoolIdentifier(
          _srcAddress,
          _destAddress,
          0n,
          // Trim from 0 fee postfix, so it become comparable
        ).slice(0, -1);
        selectedPools = await this._getPoolsFromIdentifiers(
          limitPools.filter(identifier =>
            identifier.startsWith(pairIdentifierWithoutFee),
          ),
          blockNumber,
        );
      }
      if (selectedPools.length === 0) return null;
      const states = await Promise.all(
        selectedPools.map(async pool => {
          let state = pool.getState(blockNumber);
          if (state === null || !state.isValid) {
            if (state === null) {
              this.logger.trace(
                `${this.dexKey}: State === null. Generating new one`,
              );
            } else if (!state.isValid) {
              this.logger.trace(
                `${this.dexKey}: State is invalid. Generating new one`,
              );
            }
            state = await pool.generateState(blockNumber);
            pool.setState(state, blockNumber);
          }
          return state;
        }),
      );
      const unitAmount = getBigIntPow(
        side == SwapSide.SELL ? _srcToken.decimals : _destToken.decimals,
      );

      const _amounts = [...amounts.slice(1)];

      const [token0] = this._sortTokens(_srcAddress, _destAddress);

      const zeroForOne = token0 === _srcAddress ? true : false;

      const result = await Promise.all(
        selectedPools.map(async (pool, i) => {
          const state = states[i];

          const [unit, prices] = await Promise.all([
            this._getOutputs(state, [unitAmount], zeroForOne, side),
            this._getOutputs(state, _amounts, zeroForOne, side),
          ]);

          if (!prices || !unit) {
            throw new Error('Prices or unit is not calculated');
          }

          return {
            unit: unit[0],
            prices: [0n, ...prices],
            data: {
              path: [
                {
                  tokenIn: _srcAddress,
                  tokenOut: _destAddress,
                  fee: pool.fee.toString(),
                },
              ],
            },
            poolIdentifier: this.getPoolIdentifier(
              pool.token0,
              pool.token1,
              BigInt(pool.fee),
            ),
            exchange: this.dexKey,
            gasCost: KS_ELASTIC_QUOTE_GASLIMIT,
            poolAddresses: [pool.poolAddress],
          };
        }),
      );
      return result;
    } catch (e) {
      this.logger.error(
        `Error_getPricesVolume ${srcToken.symbol || srcToken.address}, ${
          destToken.symbol || destToken.address
        }, ${side}:`,
        e,
      );
      return null;
    }
  }

  getAdapterParam(
    srcToken: string,
    destToken: string,
    srcAmount: string,
    destAmount: string,
    data: KsElasticData,
    side: SwapSide,
  ): AdapterExchangeParam {
    const { path: rawPath } = data;
    const path = this._encodePath(rawPath, side);

    const payload = this.abiCoder.encodeParameter(
      {
        ParentStruct: {
          path: 'bytes',
          deadline: 'uint256',
        },
      },
      {
        path,
        deadline: this.getDeadline(),
      },
    );
    return {
      targetExchange: this.config.router,
      payload,
      networkFee: '0',
    };
  }

  async getSimpleParam(
    srcToken: string,
    destToken: string,
    srcAmount: string,
    destAmount: string,
    data: KsElasticData,
    side: SwapSide,
  ): Promise<SimpleExchangeParam> {
    const swapFunction =
      side === SwapSide.SELL
        ? KsElasticFunctions.exactInput
        : KsElasticFunctions.exactOutput;

    const path = this._encodePath(data.path, side);
    const swapFunctionParams: KsElasticParam =
      side === SwapSide.SELL
        ? {
            recipient: this.augustusAddress,
            deadline: this.getDeadline(),
            amountIn: srcAmount,
            minAmountOut: destAmount,
            path,
          }
        : {
            recipient: this.augustusAddress,
            deadline: this.getDeadline(),
            amountOut: destAmount,
            maxAmountIn: srcAmount,
            path,
          };
    const swapData = this.routerIface.encodeFunctionData(swapFunction, [
      swapFunctionParams,
    ]);
    return this.buildSimpleParamWithoutWETHConversion(
      srcToken,
      srcAmount,
      destToken,
      destAmount,
      swapData,
      this.config.router,
    );
  }

  async getTopPoolsForToken(
    tokenAddress: Address,
    limit: number,
  ): Promise<PoolLiquidity[]> {
    return [];
  }

  private async _getPoolsFromIdentifiers(
    poolIdentifiers: string[],
    blockNumber: number,
  ): Promise<KsElasticEventPool[]> {
    const pools = await Promise.all(
      poolIdentifiers.map(async identifier => {
        const [, srcAddress, destAddress, fee] = identifier.split('_');

        return this.getPool(
          srcAddress,
          destAddress,
          ToFeeAmount(Number(fee)),
          blockNumber,
        );
      }),
    );
    return pools.filter(pool => pool) as KsElasticEventPool[];
  }

  private _getLoweredAddresses(srcToken: Token, destToken: Token) {
    return [srcToken.address.toLowerCase(), destToken.address.toLowerCase()];
  }

  private _sortTokens(srcAddress: Address, destAddress: Address) {
    return [srcAddress, destAddress].sort((a, b) => (a < b ? -1 : 1));
  }

  private _toLowerForAllConfigAddresses() {
    // If new config property will be added, the TS will throw compile error
    const newConfig: DexParams = {
      router: this.config.router.toLowerCase(),
      factory: this.config.factory.toLowerCase(),
      supportedFees: this.config.supportedFees,
      tickReader: this.config.tickReader.toLowerCase(),
      multiCall: this.config.multiCall.toLocaleLowerCase(),
    };
    return newConfig;
  }

  private async _getOutputs(
    state: DeepReadonly<PoolState>,
    amounts: bigint[],
    zeroForOne: boolean,
    side: SwapSide,
  ): Promise<bigint[] | null> {
    try {
      const outputs = await ksElasticMath.queryOutputs(
        state,
        amounts,
        zeroForOne,
        side,
      );
      return outputs;
    } catch (e) {
      this.logger.error(
        `${this.dexKey}: received error in _getSellOutputs while calculating outputs`,
        e,
      );
      return null;
    }
  }

  private async _querySubgraph(
    query: string,
    variables: Object,
    timeout = 30000,
  ) {
    try {
      const res = await this.dexHelper.httpRequest.post(
        KS_ELASTIC_SUBGRAPH_URL,
        { query, variables },
        undefined,
        { timeout: timeout },
      );
      return res.data;
    } catch (e) {
      this.logger.error(`${this.dexKey}: can not query subgraph: `, e);
      return {};
    }
  }

  private _encodePath(
    path: {
      tokenIn: Address;
      tokenOut: Address;
      fee: NumberAsString;
    }[],
    side: SwapSide,
  ): string {
    if (path.length === 0) {
      this.logger.error(
        `${this.dexKey}: Received invalid path=${path} for side=${side} to encode`,
      );
      return '0x';
    }

    const { _path, types } = path.reduce(
      (
        { _path, types }: { _path: string[]; types: string[] },
        curr,
        index,
      ): { _path: string[]; types: string[] } => {
        if (index === 0) {
          return {
            types: ['address', 'uint24', 'address'],
            _path: [curr.tokenIn, curr.fee, curr.tokenOut],
          };
        } else {
          return {
            types: [...types, 'uint24', 'address'],
            _path: [..._path, curr.fee, curr.tokenOut],
          };
        }
      },
      { _path: [], types: [] },
    );

    return side === SwapSide.BUY
      ? pack(types.reverse(), _path.reverse())
      : pack(types, _path);
  }
}
