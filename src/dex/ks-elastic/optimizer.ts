import _ from 'lodash';
import { UnoptimizedRate, OptimalSwap } from '../../types';
import { KsElasticConfig } from './config';
import { getKsElasticDexKey } from './utils';

const KsElasticDexKey = getKsElasticDexKey(KsElasticConfig);

function fixRoute(rawRate: OptimalSwap[]): OptimalSwap[] {
  let lastExchange: false | OptimalSwap = false;
  let optimizedRate = new Array<OptimalSwap>();
  rawRate.forEach((s: OptimalSwap) => {
    if (
      s.swapExchanges.length !== 1 ||
      KsElasticDexKey !== s.swapExchanges[0].exchange.toLowerCase()
    ) {
      lastExchange = false;
      optimizedRate.push(s);
    } else if (
      lastExchange &&
      _.last(
        <any[]>lastExchange.swapExchanges[0].data.path,
      )!.tokenOut.toLowerCase() ===
        s.swapExchanges[0].data.path[0].tokenIn.toLowerCase()
    ) {
      lastExchange.swapExchanges[0].data.path.push(
        s.swapExchanges[0].data.path[0],
      );
      lastExchange.swapExchanges[0].poolAddresses!.push(
        s.swapExchanges[0].poolAddresses![0],
      );
      lastExchange.swapExchanges[0].data.gasUSD = (
        parseFloat(lastExchange.swapExchanges[0].data.gasUSD) +
        parseFloat(s.swapExchanges[0].data.gasUSD)
      ).toFixed(6);
      lastExchange.destToken = s.destToken;
      lastExchange.destDecimals = s.destDecimals;
      lastExchange.swapExchanges[0].destAmount = s.swapExchanges[0].destAmount;
    } else {
      lastExchange = _.cloneDeep(s);
      optimizedRate.push(lastExchange);
    }
  });
  return optimizedRate;
}

export function ksElasticV3Merge(or: UnoptimizedRate): UnoptimizedRate {
  or.bestRoute = or.bestRoute.map(r => ({
    ...r,
    swaps: fixRoute(r.swaps),
  }));
  return or;
}
