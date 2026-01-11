export interface AhmaOptions {
  hullLength?: number;
  adaptiveWindow?: number;
  fastPeriod?: number;
  slowPeriod?: number;
}

export interface AhmaResult {
  hma: (number | null)[];
  ahma: (number | null)[];
}

const defaultOptions: Required<AhmaOptions> = {
  hullLength: 21,
  adaptiveWindow: 14,
  fastPeriod: 2,
  slowPeriod: 30,
};

export function calculateAhma(
  prices: number[],
  options: AhmaOptions = {},
): AhmaResult {
  const { hullLength, adaptiveWindow, fastPeriod, slowPeriod } = {
    ...defaultOptions,
    ...options,
  };

  const sanitizedPrices = prices.map((value) =>
    typeof value === "number" && Number.isFinite(value) ? value : NaN,
  );

  const hma = calculateHma(sanitizedPrices, hullLength);
  const ahma = applyAdaptiveSmoothing(
    hma,
    adaptiveWindow,
    fastPeriod,
    slowPeriod,
  );

  return { hma, ahma };
}

function calculateHma(prices: number[], length: number): (number | null)[] {
  const hullLength = Math.max(1, Math.round(length));
  const halfLength = Math.max(1, Math.floor(hullLength / 2));
  const sqrtLength = Math.max(1, Math.round(Math.sqrt(hullLength)));

  const wmaHalf = calculateWma(prices, halfLength);
  const wmaFull = calculateWma(prices, hullLength);

  const diffSeries = prices.map((_, index) => {
    const half = wmaHalf[index];
    const full = wmaFull[index];
    if (half === null || full === null) return null;
    return 2 * half - full;
  });

  const filledDiff = diffSeries.map((value) =>
    value === null ? NaN : value,
  );

  return calculateWma(filledDiff, sqrtLength);
}

function calculateWma(values: number[], period: number): (number | null)[] {
  const effectivePeriod = Math.max(1, Math.round(period));
  const denominator = (effectivePeriod * (effectivePeriod + 1)) / 2;
  const result: (number | null)[] = Array(values.length).fill(null);

  for (let index = 0; index < values.length; index += 1) {
    if (index < effectivePeriod - 1) continue;
    let weight = effectivePeriod;
    let weightedSum = 0;
    let isValid = true;

    for (let innerIndex = index; innerIndex > index - effectivePeriod; innerIndex -= 1) {
      const value = values[innerIndex];
      if (!Number.isFinite(value)) {
        isValid = false;
        break;
      }
      weightedSum += value * weight;
      weight -= 1;
    }

    if (isValid) {
      result[index] = weightedSum / denominator;
    }
  }

  return result;
}

function applyAdaptiveSmoothing(
  values: (number | null)[],
  window: number,
  fastPeriod: number,
  slowPeriod: number,
): (number | null)[] {
  const length = values.length;
  const result: (number | null)[] = Array(length).fill(null);

  const adaptiveWindow = Math.max(2, Math.round(window));
  const fast = Math.max(1, fastPeriod);
  const slow = Math.max(fast + 1, slowPeriod);

  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);

  let previous: number | null = null;

  for (let index = 0; index < length; index += 1) {
    const current = values[index];
    if (
      current === null ||
      current === undefined ||
      !Number.isFinite(current)
    ) {
      continue;
    }

    if (previous === null) {
      result[index] = current;
      previous = current;
      continue;
    }

    const lookBackStart = Math.max(0, index - adaptiveWindow + 1);
    const windowValues: number[] = [];
    for (let j = lookBackStart; j <= index; j += 1) {
      const candidate = values[j];
      if (
        candidate !== null &&
        candidate !== undefined &&
        Number.isFinite(candidate)
      ) {
        windowValues.push(candidate);
      }
    }

    if (windowValues.length < 2) {
      result[index] = current;
      previous = current;
      continue;
    }

    const change = Math.abs(
      windowValues[windowValues.length - 1] - windowValues[0],
    );
    let volatility = 0;
    for (let j = 1; j < windowValues.length; j += 1) {
      volatility += Math.abs(windowValues[j] - windowValues[j - 1]);
    }

    const efficiency = volatility === 0 ? 0 : change / volatility;
    const smoothingConstant = Math.pow(
      efficiency * (fastSC - slowSC) + slowSC,
      2,
    );

    const baseline: number = previous ?? current;
    const nextValue = baseline + smoothingConstant * (current - baseline);
    result[index] = nextValue;
    previous = nextValue;
  }

  return result;
}
