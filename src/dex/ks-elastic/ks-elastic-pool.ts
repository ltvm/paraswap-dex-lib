import _, { chunk, filter } from 'lodash';
import { Contract } from 'web3-eth-contract';
import { AbiItem } from 'web3-utils';
import { Interface } from '@ethersproject/abi';
import { DeepReadonly } from 'ts-essentials';
import { Log, Logger, BlockHeader, Address } from '../../types';
import { StatefulEventSubscriber } from '../../stateful-event-subscriber';
import { IDexHelper } from '../../dex-helper/idex-helper';

import { PoolState, TickInfo } from './types';

import ElasticFactoryABI from '../../abi/ks-elastic/ElasticFactory.json';
import TickReaderABI from '../../abi/ks-elastic/TickReader.json';
import PoolInstanceABI from '../../abi/ks-elastic/PoolInstance.json';

import MultiCallABI from '../../abi/ks-elastic/Multicall.json';

import { bigIntify } from '../../utils';
import { ksElasticMath } from './contract-math/ks-elastic-math';
import { NumberAsString } from 'paraswap-core';
import {
  OUT_OF_RANGE_ERROR_POSTFIX,
  FeeAmount,
  TickSpacing,
} from './constants';

type stateRequestCallData = {
  funcName: string;
  params: unknown[];
};

type multiCallInput = {
  target: string;
  callData: string;
};

export class KsElasticEventPool extends StatefulEventSubscriber<PoolState> {
  handlers: {
    [event: string]: (event: any, pool: PoolState, log: Log) => PoolState;
  } = {};

  logDecoder: (log: Log) => any;

  addressesSubscribed: string[];

  readonly token0: Address;

  readonly token1: Address;

  private _poolAddress?: Address;

  readonly tickReader: Contract;
  private poolContract: Contract;
  readonly poolFactoryContract: Contract;
  readonly multiCallContract: Contract;
  private isSetPoolContract: boolean | false;

  constructor(
    protected parentName: string,
    protected network: number,
    readonly dexHelper: IDexHelper,
    logger: Logger,
    tickReaderAddress: Address,
    poolFactoryAddress: Address,
    readonly fee: FeeAmount,
    token0: Address,
    token1: Address,
    multiCallAddress: Address,

    readonly reinvestLiquidity: bigint,

    readonly poolIface = new Interface(PoolInstanceABI),
  ) {
    super(`${parentName}_${token0}_${token1}_pool`, logger);
    this.token0 = token0.toLowerCase();
    this.token1 = token1.toLowerCase();
    this.logDecoder = (log: Log) => this.poolIface.parseLog(log);
    this.addressesSubscribed = new Array<Address>(1);

    this.poolFactoryContract = new this.dexHelper.web3Provider.eth.Contract(
      ElasticFactoryABI as AbiItem[],
      poolFactoryAddress,
    );

    this.tickReader = new this.dexHelper.web3Provider.eth.Contract(
      TickReaderABI as AbiItem[],
      tickReaderAddress,
    );
    this.multiCallContract = new this.dexHelper.web3Provider.eth.Contract(
      MultiCallABI as AbiItem[],
      multiCallAddress,
    );
    this.poolContract = new this.dexHelper.web3Provider.eth.Contract(
      PoolInstanceABI as AbiItem[],
    );
    this.isSetPoolContract = false;
    // Add handlers
    this.handlers['Swap'] = this.handleSwapEvent.bind(this);
    this.handlers['Burn'] = this.handleBurnEvent.bind(this);
    this.handlers['Mint'] = this.handleMintEvent.bind(this);
  }

  get poolAddress() {
    if (this._poolAddress === undefined) {
      throw new Error(
        `${this.parentName}: First call generateState at least one time before requesting poolAddress`,
      );
    }
    return this._poolAddress;
  }

  set poolAddress(address: Address) {
    this._poolAddress = address;
  }

  protected processLog(
    state: DeepReadonly<PoolState>,
    log: Readonly<Log>,
  ): DeepReadonly<PoolState> | null {
    try {
      const event = this.logDecoder(log);
      if (event.name in this.handlers) {
        // Because we have observations in array which is mutable by nature, there is a
        // ts compile error: https://stackoverflow.com/questions/53412934/disable-allowing-assigning-readonly-types-to-non-readonly-types
        // And there is no good workaround, so turn off the type checker for this line
        const stateCopy = _.cloneDeep(state);

        return this.handlers[event.name](event, stateCopy, log);
      }
      return state;
    } catch (e) {
      this.logger.error(
        `Error_${this.parentName}_processLog could not parse the log with topic ${log.topics}:`,
        e,
      );
      return null;
    }
  }

  getPoolStateRequest() {
    const data = {
      funcName: 'getPoolState',
      params: [],
    };
    return data;
  }

  getPoolCallData(): stateRequestCallData {
    const data = {
      funcName: 'getPool',
      params: [this.token0, this.token1, Number(this.fee)],
    };
    return data;
  }

  generateMultiCallInput(ticks: Number[]): multiCallInput[] {
    return ticks.map(tickIndex => ({
      target: this.poolAddress,
      callData: this.poolIface.encodeFunctionData('ticks', [tickIndex]),
    }));
  }

  decodeMultiCallResult(multiCallTickResult: []) {
    const result = new Array(multiCallTickResult.length);
    multiCallTickResult.forEach((element, index) => {
      result[index] = this.poolIface.decodeFunctionResult('ticks', element);
    });
    console.log('decodeMultiCallResult---');
    return result;
  }

  private setTicksMapping(
    ticks: Record<NumberAsString, TickInfo>,
    tickArray: number[],
    tickInfosFromContract: any[],
  ) {
    return tickInfosFromContract.reduce<Record<string, TickInfo>>(
      (acc, element, index) => {
        acc[tickArray[index]] = {
          liquidityGross: bigIntify(element.liquidityGross),
          liquidityNet: bigIntify(element.liquidityNet),
          tickCumulativeOutside: bigIntify(element.feeGrowthOutside),
          secondsPerLiquidityOutsideX128: bigIntify(
            element.secondsPerLiquidityOutside,
          ),
          secondsOutside: bigIntify(
            element.liquidityNet * element.secondsPerLiquidityOutside,
          ),
          initialized: true,
          index: tickArray[index],
        };
        return acc;
      },
      ticks,
    );
  }

  getAllTickRequest(poolAddress: string): stateRequestCallData {
    const data = {
      funcName: 'getAllTicks',
      params: [poolAddress],
    };
    return data;
  }

  async gePoolContract() {
    try {
      const getPoolData = this.getPoolCallData();
      const poolAddress = await this.poolFactoryContract.methods[
        getPoolData.funcName
      ](...getPoolData.params).call();
      this.poolAddress = poolAddress;
      return new this.dexHelper.web3Provider.eth.Contract(
        PoolInstanceABI as AbiItem[],
        poolAddress,
      );
    } catch (error) {
      throw error;
    }
  }

  getPoolState(blockNumber: number) {
    const callRequest = this.getPoolStateRequest();
    return this.poolContract.methods[callRequest.funcName](
      ...callRequest.params,
    ).call({}, blockNumber || 'latest');
  }

  getAllTick(poolAddress: string, blockNumber: number) {
    const callRequest = this.getAllTickRequest(poolAddress);
    return this.tickReader.methods[callRequest.funcName](
      ...callRequest.params,
    ).call({}, blockNumber || 'latest');
  }

  getLiquidityState(blockNumber: number) {
    return this.poolContract.methods['getLiquidityState']().call(
      {},
      blockNumber || 'latest',
    );
  }

  async getTickInfoFromContract(ticks: number[]) {
    console.log('getTickInfoFromContract````');

    const multiCallResult = (
      await this.multiCallContract.methods
        .aggregate(this.generateMultiCallInput(ticks))
        .call()
    ).returnData;
    return this.decodeMultiCallResult(multiCallResult);
  }

  // async getAllTickInfoFromContract(ticks: number[]) {
  //   if (ticks.length < 100) {
  //       return this.getAllTickInfoFromContract(ticks)
  //   }
  //   chunk
  // }

  setTickList(
    tickList: Array<TickInfo>,
    tickArray: number[],
    tickInfoFromContract: any[],
  ) {
    tickInfoFromContract.forEach((element, index) => {
      tickList[index] = {
        liquidityGross: bigIntify(element.liquidityGross),
        liquidityNet: bigIntify(element.liquidityNet),
        tickCumulativeOutside: bigIntify(element.feeGrowthOutside),
        secondsPerLiquidityOutsideX128: bigIntify(
          element.secondsPerLiquidityOutside,
        ),
        secondsOutside: bigIntify(
          element.liquidityNet * element.secondsPerLiquidityOutside,
        ),
        initialized: true,
        index: tickArray[index],
      };
    });
  }

  async generateState(blockNumber: number): Promise<Readonly<PoolState>> {
    console.log('generateState`````1111');
    // TODO: Should be handle it first before processing other logics
    // Cache pool contract for next process
    if (!this.isSetPoolContract) {
      this.poolContract = await this.gePoolContract();
      this.isSetPoolContract = true;
    }

    const batchRequestData = [
      this.getAllTick(this.poolAddress, blockNumber),
      this.getPoolState(blockNumber),
      this.getLiquidityState(blockNumber),
    ];
    const [_ticks, _poolState, _liquidityState] = await Promise.all(
      batchRequestData,
    );
    const ticks = {};
    const newTicks = filter(_ticks, tick => tick != 0);
    const tickInfosFromContract = await this.getTickInfoFromContract(newTicks);

    console.log('tickInfosFromContract`````success');

    this.setTicksMapping(ticks, newTicks, tickInfosFromContract);

    // Not really a good place to do it, but in order to save RPC requests,
    // put it here
    this.addressesSubscribed[0] = this.poolAddress;

    const currentTick = _poolState.currentTick;
    const tickSpacing = bigIntify(TickSpacing[this.fee]);
    let isValid = false;
    if (_poolState.locked == false || _poolState.locked == undefined) {
      isValid = true;
    }
    console.log('isValid', isValid);

    const tickList = new Array<TickInfo>(newTicks.length);
    this.setTickList(tickList, newTicks, tickInfosFromContract);
    return <PoolState>{
      tickSpacing,
      fee: this.fee,
      sqrtPriceX96: bigIntify(_poolState.sqrtP),
      liquidity: bigIntify(_liquidityState.baseL),
      tickList,
      ticks,
      isValid,
      currentTick: currentTick,
      reinvestLiquidity: _liquidityState.reinvestL,
    };
  }

  handleSwapEvent(event: any, pool: PoolState, log: Log) {
    const newSqrtPriceX96 = bigIntify(event.args.sqrtPriceX96);
    const amount0 = bigIntify(event.args.amount0);
    const newTick = bigIntify(event.args.tick);
    const newLiquidity = bigIntify(event.args.liquidity);

    if (amount0 === 0n) {
      this.logger.error(
        `${this.parentName}: amount0 === 0n for ${this.poolAddress} . Check why it happened`,
      );
      pool.isValid = false;
      return pool;
    } else {
      const zeroForOne = amount0 > 0n;

      return this._callAndHandleError(
        // I had strange TS compiler issue, so have to write it this way
        () =>
          ksElasticMath.swapFromEvent(
            pool,
            amount0,
            newSqrtPriceX96,
            newTick,
            newLiquidity,
            zeroForOne,
          ),
        pool,
      );
    }
  }

  handleBurnEvent(event: any, pool: PoolState, log: Log) {
    const amount = bigIntify(event.args.amount);
    const tickLower = bigIntify(event.args.tickLower);
    const tickUpper = bigIntify(event.args.tickUpper);

    return this._callAndHandleError(
      ksElasticMath._modifyPosition.bind(ksElasticMath, pool, {
        tickLower,
        tickUpper,
        liquidityDelta: -BigInt.asIntN(128, BigInt.asIntN(256, amount)),
      }),
      pool,
    );
  }

  handleMintEvent(event: any, pool: PoolState, log: Log) {
    const amount = bigIntify(event.args.amount);
    const tickLower = bigIntify(event.args.tickLower);
    const tickUpper = bigIntify(event.args.tickUpper);

    return this._callAndHandleError(
      ksElasticMath._modifyPosition.bind(ksElasticMath, pool, {
        tickLower,
        tickUpper,
        liquidityDelta: amount,
      }),
      pool,
    );
  }

  private _reduceTickBitmap(
    tickBitmap: Record<NumberAsString, bigint>,
    tickBitmapToReduce: [],
  ) {
    return tickBitmapToReduce.reduce<Record<NumberAsString, bigint>>(
      (acc, tickIndex) => {
        acc[tickIndex] = bigIntify(tickIndex);
        return acc;
      },
      tickBitmap,
    );
  }

  private _callAndHandleError(func: Function, pool: PoolState) {
    try {
      func();
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.endsWith(OUT_OF_RANGE_ERROR_POSTFIX)
      ) {
        this.logger.trace(
          `${this.parentName}: Pool ${this.poolAddress} on network ${this.network} is out of TickBitmap requested range. Re-query the state`,
          e,
        );
      } else {
        this.logger.error(
          'Unexpected error while handling event for KyberSwap Elastic',
          e,
        );
      }
      pool.isValid = false;
    }
    return pool;
  }
}
