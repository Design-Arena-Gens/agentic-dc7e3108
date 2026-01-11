'use client';

import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import type { ChartData, ChartOptions, TooltipItem } from "chart.js";
import { Line } from "react-chartjs-2";
import { calculateAhma } from "@/lib/ahma";
import { samplePriceSeries } from "@/lib/sampleData";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

const defaultInput = samplePriceSeries
  .map((point) => `${point.date}, ${point.close}`)
  .join("\n");

const priceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface ParsedSeries {
  labels: string[];
  values: number[];
  error: string | null;
}

interface CrossSignal {
  type: "bullish" | "bearish";
  index: number;
}

export default function Home() {
  const [rawSeries, setRawSeries] = useState(defaultInput);
  const [hullLength, setHullLength] = useState(21);
  const [adaptiveWindow, setAdaptiveWindow] = useState(14);
  const [fastPeriod, setFastPeriod] = useState(2);
  const [slowPeriod, setSlowPeriod] = useState(30);

  const parsed = useMemo<ParsedSeries>(() => parseSeries(rawSeries), [rawSeries]);

  const { hma, ahma } = useMemo(() => {
    if (parsed.values.length === 0) {
      return { hma: [] as (number | null)[], ahma: [] as (number | null)[] };
    }
    return calculateAhma(parsed.values, {
      hullLength,
      adaptiveWindow,
      fastPeriod,
      slowPeriod,
    });
  }, [parsed.values, hullLength, adaptiveWindow, fastPeriod, slowPeriod]);

  const labels = useMemo(() => {
    if (parsed.labels.length !== parsed.values.length) {
      return parsed.values.map((_, index) => `Point ${index + 1}`);
    }
    return parsed.labels;
  }, [parsed.labels, parsed.values]);

  const chartData = useMemo(
    () => createChartData(labels, parsed.values, hma, ahma),
    [labels, parsed.values, hma, ahma],
  );

  const chartOptions = useMemo(() => createChartOptions(), []);

  const lastIndex = parsed.values.length - 1;
  const previousIndex = lastIndex - 1;
  const latestPrice = lastIndex >= 0 ? parsed.values[lastIndex] : null;
  const latestAhma = lastIndex >= 0 ? ahma[lastIndex] ?? null : null;
  const previousAhma =
    previousIndex >= 0 ? ahma[previousIndex] ?? null : null;

  const slope =
    latestAhma !== null && previousAhma !== null
      ? latestAhma - previousAhma
      : null;

  const spread =
    latestPrice !== null && latestAhma !== null && latestAhma !== 0
      ? ((latestPrice - latestAhma) / latestAhma) * 100
      : null;

  const crossSignal = useMemo<CrossSignal | null>(
    () => findLatestCross(parsed.values, ahma),
    [parsed.values, ahma],
  );

  const crossDescription =
    crossSignal && labels[crossSignal.index]
      ? `${capitalize(crossSignal.type)} crossover on ${labels[crossSignal.index]
        }`
      : "No crossover detected";

  const barsSinceCross =
    crossSignal && labels.length
      ? labels.length - crossSignal.index - 1
      : null;

  const slopeClass =
    slope !== null && slope >= 0 ? "delta-positive" : "delta-negative";
  const spreadClass =
    spread !== null && spread >= 0 ? "delta-positive" : "delta-negative";

  return (
    <main className="page-container">
      <header className="header">
        <h1>AHMA Indicator Studio</h1>
        <p>
          Adaptive Hull Moving Average (AHMA) blends the responsiveness of a Hull
          Moving Average with adaptive smoothing. Load your own dataset or tweak
          the smoothing parameters to shape the indicator in real time.
        </p>
      </header>

      <section className="indicator-grid">
        <div className="card">
          <h2>Data &amp; Parameters</h2>
          <p className="mobile-breakout">
            Use the controls to feed price values and tune the AHMA behaviour.
          </p>
          <form className="controls-form">
            <div className="field">
              <label htmlFor="price-series">Price Series</label>
              <textarea
                id="price-series"
                value={rawSeries}
                onChange={(event) => setRawSeries(event.target.value)}
                placeholder="YYYY-MM-DD, 432.18"
                spellCheck={false}
              />
              {parsed.error ? (
                <div className="error-banner">{parsed.error}</div>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="hull-length">Hull Length</label>
              <input
                id="hull-length"
                type="number"
                min={1}
                value={hullLength}
                onChange={(event) => {
                  const next = Number.isFinite(event.target.valueAsNumber)
                    ? Math.max(1, Math.round(event.target.valueAsNumber))
                    : 1;
                  setHullLength(next);
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="adaptive-window">Adaptive Lookback</label>
              <input
                id="adaptive-window"
                type="number"
                min={2}
                value={adaptiveWindow}
                onChange={(event) => {
                  const next = Number.isFinite(event.target.valueAsNumber)
                    ? Math.max(2, Math.round(event.target.valueAsNumber))
                    : adaptiveWindow;
                  setAdaptiveWindow(next);
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="fast-period">Fast Smoothing Period</label>
              <input
                id="fast-period"
                type="number"
                min={1}
                value={fastPeriod}
                onChange={(event) => {
                  const rawValue = event.target.valueAsNumber;
                  const next = Number.isFinite(rawValue)
                    ? Math.max(1, Math.round(rawValue))
                    : fastPeriod;
                  setFastPeriod(next);
                  if (slowPeriod <= next) {
                    setSlowPeriod(next + 1);
                  }
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="slow-period">Slow Smoothing Period</label>
              <input
                id="slow-period"
                type="number"
                min={fastPeriod + 1}
                value={slowPeriod}
                onChange={(event) =>
                  setSlowPeriod(() => {
                    const rawValue = event.target.valueAsNumber;
                    const next = Number.isFinite(rawValue)
                      ? Math.round(rawValue)
                      : slowPeriod;
                    return Math.max(fastPeriod + 1, next);
                  })
                }
              />
            </div>

            <div className="button-row">
              <button
                type="button"
                className="button"
                onClick={() => setRawSeries(defaultInput)}
              >
                Load Sample Data
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setRawSeries("")}
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        <div className="card chart-card">
          <h2>Indicator Visualisation</h2>
          <div className="chart-wrapper">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Latest Metrics</h2>
        <div className="stats-grid">
          <article className="stat-block">
            <span className="stat-label">Last Close</span>
            <span className="stat-value">
              {latestPrice !== null ? `$${priceFormatter.format(latestPrice)}` : "—"}
            </span>
          </article>

          <article className="stat-block">
            <span className="stat-label">Last AHMA</span>
            <span className="stat-value">
              {latestAhma !== null ? `$${priceFormatter.format(latestAhma)}` : "—"}
            </span>
          </article>

          <article className="stat-block">
            <span className="stat-label">AHMA Slope</span>
            <span className={`stat-value ${slopeClass}`}>
              {slope !== null
                ? `${slope >= 0 ? "+" : ""}${priceFormatter.format(slope)}`
                : "—"}
            </span>
          </article>

          <article className="stat-block">
            <span className="stat-label">Price vs AHMA</span>
            <span className={`stat-value ${spreadClass}`}>
              {spread !== null
                ? `${spread >= 0 ? "+" : ""}${percentFormatter.format(spread)}%`
                : "—"}
            </span>
          </article>

          <article className="stat-block">
            <span className="stat-label">Recent Signal</span>
            <span className="stat-value">{crossDescription}</span>
          </article>

          <article className="stat-block">
            <span className="stat-label">Bars Since Signal</span>
            <span className="stat-value">
              {barsSinceCross !== null ? `${barsSinceCross} bars` : "—"}
            </span>
          </article>
        </div>
      </section>
    </main>
  );
}

function parseSeries(raw: string): ParsedSeries {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { labels: [], values: [], error: null };
  }

  const labels: string[] = [];
  const values: number[] = [];
  const errors: string[] = [];

  const lines = trimmed.split(/\r?\n/);

  lines.forEach((line, index) => {
    const clean = line.trim();
    if (!clean) {
      return;
    }

    let label: string;
    let numericFragment: string;

    if (clean.includes(",")) {
      const [rawLabel, rawValue] = clean.split(",");
      label = rawLabel?.trim() || `Point ${index + 1}`;
      numericFragment = rawValue?.trim() ?? "";
    } else {
      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        label = `Point ${index + 1}`;
        numericFragment = parts[0];
      } else {
        label = parts.slice(0, parts.length - 1).join(" ");
        numericFragment = parts[parts.length - 1];
      }
    }

    const value = Number.parseFloat(numericFragment);
    if (!Number.isFinite(value)) {
      errors.push(clean);
      return;
    }

    labels.push(label);
    values.push(value);
  });

  return {
    labels,
    values,
    error:
      errors.length > 0
        ? `Skipped ${errors.length} line(s): ${errors
            .slice(0, 3)
            .map((line) => `"${line}"`)
            .join(", ")}`
        : null,
  };
}

function createChartData(
  labels: string[],
  prices: number[],
  hma: (number | null)[],
  ahma: (number | null)[],
): ChartData<"line", (number | null)[], string> {
  const priceColor = "rgba(97, 217, 251, 0.85)";
  const hmaColor = "rgba(144, 111, 255, 0.8)";
  const ahmaColor = "rgba(111, 255, 212, 0.9)";

  const paddedPrices = labels.map((_, index) => prices[index] ?? null);
  const paddedHma = labels.map((_, index) => hma[index] ?? null);
  const paddedAhma = labels.map((_, index) => ahma[index] ?? null);

  return {
    labels,
    datasets: [
      {
        label: "Close",
        data: paddedPrices,
        borderColor: priceColor,
        backgroundColor: "rgba(97, 217, 251, 0.12)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      },
      {
        label: "HMA",
        data: paddedHma,
        borderColor: hmaColor,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.35,
        borderDash: [6, 4],
      },
      {
        label: "AHMA",
        data: paddedAhma,
        borderColor: ahmaColor,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.38,
      },
    ],
  };
}

function createChartOptions(): ChartOptions<"line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: "rgba(229, 239, 255, 0.7)",
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<"line">) => {
            const label = context.dataset.label ?? "";
            if (context.parsed.y === null) {
              return `${label}: —`;
            }
            return `${label}: ${priceFormatter.format(context.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "rgba(229, 239, 255, 0.55)",
          maxRotation: 0,
          autoSkipPadding: 16,
        },
        grid: {
          color: "rgba(97, 217, 251, 0.08)",
        },
      },
      y: {
        ticks: {
          color: "rgba(229, 239, 255, 0.55)",
          callback: (value: number | string) =>
            `$${priceFormatter.format(Number(value))}`,
        },
        grid: {
          color: "rgba(97, 217, 251, 0.08)",
        },
      },
    },
  };
}

function findLatestCross(
  prices: number[],
  ahma: (number | null)[],
): CrossSignal | null {
  for (let index = prices.length - 1; index > 0; index -= 1) {
    const price = prices[index];
    const prevPrice = prices[index - 1];
    const indicator = ahma[index];
    const prevIndicator = ahma[index - 1];
    if (
      indicator === null ||
      prevIndicator === null ||
      !Number.isFinite(price) ||
      !Number.isFinite(prevPrice)
    ) {
      continue;
    }

    const currentDiff = price - indicator;
    const previousDiff = prevPrice - prevIndicator;

    if (currentDiff >= 0 && previousDiff < 0) {
      return { type: "bullish", index };
    }

    if (currentDiff <= 0 && previousDiff > 0) {
      return { type: "bearish", index };
    }
  }

  return null;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
