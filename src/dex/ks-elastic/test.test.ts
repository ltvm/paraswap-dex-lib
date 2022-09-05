// import { MultiCallInput } from '../../types';
// import Web3 from 'web3';
// import ElasticTickReaderMulticallABI from '../../abi/ks-elastic/TickReader.json';
// import ElasticFactoryABI from '../../abi/ks-elastic/ElasticFactory.json';
// import PoolABI from '../../abi/ks-elastic/PoolInstance.json';
// import UniswapV3StateMulticallABI from '../../abi/uniswap-v3/UniswapV3StateMulticall.abi.json';
// import MultiCallABI from '../../abi/ks-elastic/Multicall.json'
// import { Interface } from '@ethersproject/abi';
// import {
//   PoolState,
//   TickBitMapMappings,
//   TickInfo,
//   TickInfoMappings,
// } from './types';
// import { bigIntify } from '../../utils';

// import { NumberAsString } from 'paraswap-core';

// import { AbiItem } from 'web3-utils';

// type callData = {
//   funcName: string;
//   params: unknown[];
// }

// type multiCallInput = {
//   target: string;
//   callData: string;
// }

// function getStateRequestCallData(poolAddress: string) : callData{
//       const data = {
//         funcName: 'getAllTicks',
//         params: [
//           poolAddress
//         ],
//       };
//     return data
// }

// function getPoolCallData() : callData{
//   const data = {
//     funcName: 'getPool',
//     params: [
//       "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
//       "0xdac17f958d2ee523a2206206994597c13d831ec7",
//       300,
//     ],
//   };
// return data
// }

// function getStateRequest() : callData{
//     const data = {
//       funcName: 'getFullStateWithRelativeBitmaps',
//       params: [
//        "0x1F98431c8aD98523631AE4a59f267346ea31F984",
//         "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
//        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
//        100,
//        12,
//        12,
//       ],
//     };
//   return data
// }

// // function getTickInfo (
// //   poolIface: Interface,
// //   ticks: Record<NumberAsString, TickInfo>,
// //   multiCallTickResult: []){

// //   return multiCallTickResult.reduce<Record<string, TickInfo>>((acc, element, index) => {

// //     const result = poolIface.decodeFunctionResult("ticks", element)
// //     acc[index] = {
// //         liquidityGross: bigIntify(result.liquidityGross),
// //         liquidityNet: bigIntify(result.liquidityNet),
// //         tickCumulativeOutside: bigIntify(result.feeGrowthOutside),
// //         secondsPerLiquidityOutsideX128: bigIntify(
// //           result.secondsPerLiquidityOutside,
// //         ),
// //         secondsOutside: bigIntify(result.liquidityNet*result.secondsPerLiquidityOutside),
// //         initialized: true,
// //       };
// //       return acc;
// //     }, ticks);
// //   }

// // function getAllTickRequest(poolAddress: string) : stateRequestCallData{
// //     const data = {
// //       funcName: 'getAllTicks',
// //       params: [
// //         poolAddress
// //       ],
// //     };
// //     return data
// // }
// function generateMultiCallInput(poolIface: Interface,ticks : Number[]): multiCallInput[]{
//   return  ticks.map(tickIndex => ({
//     target: "0x7d697d789ee19bc376474E0167BADe9535A28CF4",
//     callData: poolIface.encodeFunctionData("ticks",[
//       bigIntify(tickIndex),
//     ])
//   }));
// }

// async function generateState(blockNumber: number){
//     const web3Provider = new Web3("https://api.mycryptoapi.com/eth");
//   //   const multiContract = new web3Provider.eth.Contract(
//   //      MultiCallABI as AbiItem[],
//   //       "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
//   //     );
//   //  const poolIface = new Interface(PoolABI);

//   //  const tickArray = [-199260, -200520]
//   //   const data = (
//   //     await multiContract.methods
//   //       .aggregate(generateMultiCallInput(poolIface,tickArray))
//   //       .call()
//   //   ).returnData;
//   //   const ticks = {}
//   //   getTickInfo(poolIface, ticks, data)
//   //   expect(ticks).toEqual(null)

//     const stateMultiContract = new web3Provider.eth.Contract(
//         ElasticTickReaderMulticallABI as AbiItem[],
//         "0x165c68077ac06c83800d19200e6E2B08D02dE75D",
//       );

//     const univ3Contract = new web3Provider.eth.Contract(
//       UniswapV3StateMulticallABI as AbiItem[],
//       "0x9c764D2e92dA68E4CDfD784B902283A095ff8b63",
//     );
//     const req = getStateRequest()
//     const rss = await univ3Contract.methods[req.funcName](
//       ...req.params,
//     ).call({}, blockNumber || 'latest');

//     expect(rss).toEqual([])

//     const elasticFactory = new web3Provider.eth.Contract(
//       ElasticFactoryABI as AbiItem[],
//       "0x5F1dddbf348aC2fbe22a163e30F99F9ECE3DD50a",
//     );
//     const getPoolData = getPoolCallData()
//     const rs = await elasticFactory.methods[getPoolData.funcName](
//       ...getPoolData.params,
//     ).call();

//     const poolContract = new web3Provider.eth.Contract(
//       PoolABI as AbiItem[],
//       rs,
//     );

//     const callData = getStateRequestCallData(rs);

//     const batch = [poolContract.methods["getPoolState"]().call(), stateMultiContract.methods[callData.funcName](
//       ...callData.params,
//     ).call({}, blockNumber || 'latest')]
//     const [poolState,result] = await Promise.all(batch)
//     expect(result).toEqual([])
//     expect(poolState).toEqual(null)

// }

// describe('Elastic E2E', () => {
//   describe(`GetAlTicks`,  () => {
//     it("Should return the correct state after the", async function () {
//      await generateState(0)
//     })
//   })
// })
