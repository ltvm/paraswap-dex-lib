import { TickInfo } from '../types';
import { _require } from '../../../utils';
import invariant from 'tiny-invariant';

export class TickList {
  public static getTick(ticks: readonly TickInfo[], index: number): TickInfo {
    const tick = ticks[this.binarySearch(ticks, index)];
    invariant(tick.index === index, 'NOT_CONTAINED');
    return tick;
  }

  public static nextInitializedTickWithinFixedDistance(
    ticks: readonly TickInfo[],
    tick: number,
    lte: boolean,
    distance: number = 480,
  ): [number, boolean] {
    if (lte) {
      const minimum = tick - distance;
      if (this.isBelowSmallest(ticks, tick)) {
        return [minimum, false];
      }
      const index = this.nextInitializedTick(ticks, tick, lte).index;
      const nextInitializedTick = Math.max(minimum, index);
      return [nextInitializedTick, nextInitializedTick === index];
    } else {
      const maximum = tick + distance;
      if (this.isAtOrAboveLargest(ticks, tick)) {
        return [maximum, false];
      }
      const index = this.nextInitializedTick(ticks, tick, lte).index;
      const nextInitializedTick = Math.min(maximum, index);
      return [nextInitializedTick, nextInitializedTick === index];
    }
  }

  static isBelowSmallest(ticks: readonly TickInfo[], tick: number): boolean {
    invariant(ticks.length > 0, 'LENGTH');
    return tick < ticks[0].index;
  }

  public static isAtOrAboveLargest(
    ticks: readonly TickInfo[],
    tick: number,
  ): boolean {
    invariant(ticks.length > 0, 'LENGTH');
    return tick >= ticks[ticks.length - 1].index;
  }

  public static nextInitializedTick(
    ticks: readonly TickInfo[],
    tick: number,
    lte: boolean,
  ): TickInfo {
    if (lte) {
      invariant(!this.isBelowSmallest(ticks, tick), 'BELOW_SMALLEST');
      if (this.isAtOrAboveLargest(ticks, tick)) {
        return ticks[ticks.length - 1];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index];
    } else {
      invariant(!this.isAtOrAboveLargest(ticks, tick), 'AT_OR_ABOVE_LARGEST');
      if (this.isBelowSmallest(ticks, tick)) {
        return ticks[0];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index + 1];
    }
  }

  /**
   * Finds the largest tick in the list of ticks that is less than or equal to tick
   * @param ticks list of ticks
   * @param tick tick to find the largest tick that is less than or equal to tick
   * @private
   */
  private static binarySearch(
    ticks: readonly TickInfo[],
    tick: number,
  ): number {
    invariant(!this.isBelowSmallest(ticks, tick), 'BELOW_SMALLEST');

    let l = 0;
    let r = ticks.length - 1;
    let i;
    while (true) {
      i = Math.floor((l + r) / 2);

      if (
        ticks[i].index <= tick &&
        (i === ticks.length - 1 || ticks[i + 1].index > tick)
      ) {
        return i;
      }

      if (ticks[i].index < tick) {
        l = i + 1;
      } else {
        r = i - 1;
      }
    }
  }
}
