export class TimeSeriesStatisticsEngine {
  private readonly annualizationFactor = 252;

  public calculateReturns(prices: number[], _period: 'daily' | 'weekly' | 'monthly'): number[] {
    if (prices.length < 2) {
      throw new Error('At least two price points are required to calculate returns');
    }

    return prices.slice(1).map((price, index) => {
      const previous = prices[index];
      if (previous === 0) {
        throw new Error('Previous price cannot be zero when calculating returns');
      }

      return (price - previous) / previous;
    });
  }

  public calculateVolatility(returns: number[], annualize: boolean): number {
    if (returns.length < 2) {
      throw new Error('At least two return values are required to calculate volatility');
    }

    const { variance } = this.calculateSampleStatistics(returns);
    const stdDev = Math.sqrt(variance);

    if (!annualize) {
      return stdDev;
    }

    return stdDev * Math.sqrt(this.annualizationFactor);
  }

  public calculateCorrelation(series1: number[], series2: number[]): number {
    if (series1.length !== series2.length) {
      throw new Error('Input series must have same length');
    }

    if (series1.length < 2) {
      throw new Error('At least two observations are required to calculate correlation');
    }

    const n = series1.length;
    let sum1 = 0;
    let sum2 = 0;
    let sumProd = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;

    for (let i = 0; i < n; i++) {
      const x = series1[i];
      const y = series2[i];

      sum1 += x;
      sum2 += y;
      sumProd += x * y;
      sumSq1 += x * x;
      sumSq2 += y * y;
    }

    const numerator = n * sumProd - sum1 * sum2;
    const denominator = Math.sqrt((n * sumSq1 - sum1 * sum1) * (n * sumSq2 - sum2 * sum2));

    if (denominator === 0) {
      throw new Error('Variance must be greater than zero to calculate correlation');
    }

    return numerator / denominator;
  }

  public calculateDrawdown(values: number[]): {
    drawdowns: number[];
    maxDrawdown: number;
    maxDrawdownPeriod: { start: number; end: number };
    averageDrawdown: number;
  } {
    if (values.length === 0) {
      throw new Error('At least one value is required to calculate drawdown');
    }

    let peak = values[0];
    let peakIndex = 0;
    let maxDrawdown = 0;
    let maxDrawdownPeriod = { start: 0, end: 0 };
    const drawdowns: number[] = [];

    values.forEach((value, index) => {
      if (value > peak) {
        peak = value;
        peakIndex = index;
      }

      const drawdown = (value - peak) / peak;
      drawdowns.push(drawdown);

      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPeriod = { start: peakIndex, end: index };
      }
    });

    const averageDrawdown =
      drawdowns.reduce((sum, value) => sum + value, 0) / drawdowns.length;

    return {
      drawdowns,
      maxDrawdown,
      maxDrawdownPeriod,
      averageDrawdown,
    };
  }

  public calculateSharpeRatio(returns: number[], riskFreeRate: number): number {
    if (returns.length < 2) {
      throw new Error('At least two return values are required to calculate Sharpe ratio');
    }

    const excessReturns = returns.map((value) => value - riskFreeRate);
    const { mean, variance } = this.calculateSampleStatistics(excessReturns);

    if (variance === 0) {
      throw new Error('Return variance must be greater than zero to calculate Sharpe ratio');
    }

    const stdDev = Math.sqrt(variance);

    return mean / stdDev;
  }

  public calculateHistoricalVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) {
      throw new Error('At least one return value is required to calculate VaR');
    }

    if (confidence <= 0 || confidence >= 1) {
      throw new Error('confidence must be between 0 and 1');
    }

    const sorted = [...returns].sort((a, b) => a - b);
    const position = Math.max(0, Math.ceil((1 - confidence) * sorted.length) - 1);

    return sorted[position];
  }

  public calculateCorrelationMatrix(series: number[][]): number[][] {
    if (series.length === 0) {
      throw new Error('At least one series is required to calculate correlation matrix');
    }

    const length = series[0].length;
    if (length < 2) {
      throw new Error('At least two observations are required to calculate correlation matrix');
    }

    for (const s of series) {
      if (s.length !== length) {
        throw new Error('All series must have the same length');
      }
    }

    const matrix: number[][] = [];

    for (let i = 0; i < series.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < series.length; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else if (j < i) {
          // Reuse symmetry
          matrix[i][j] = matrix[j][i];
        } else {
          matrix[i][j] = this.calculateCorrelation(series[i], series[j]);
        }
      }
    }

    return matrix;
  }

  private calculateSampleStatistics(values: number[]): { mean: number; variance: number } {
    const n = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / n;

    const squaredDiffs = values.reduce((sum, value) => {
      const diff = value - mean;
      return sum + diff * diff;
    }, 0);

    const variance = squaredDiffs / (n - 1);

    return { mean, variance };
  }
}
