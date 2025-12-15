import { TimeSeriesStatisticsEngine } from '@/analytics/time-series-statistics-engine';

describe('TimeSeriesStatisticsEngine', () => {
  const engine = new TimeSeriesStatisticsEngine();

  describe('calculateReturns', () => {
    it('価格系列から単純リターンを計算する', () => {
      const prices = [100, 110, 121];

      const returns = engine.calculateReturns(prices, 'daily');

      expect(returns).toEqual([0.1, 0.1]);
    });

    it('データポイントが不足している場合はエラーを投げる', () => {
      expect(() => engine.calculateReturns([100], 'daily')).toThrow('At least two price points');
    });
  });

  describe('calculateVolatility', () => {
    it('リターンの標準偏差を年率換算付きで返す', () => {
      const returns = [0.01, -0.02, 0.015];

      const result = engine.calculateVolatility(returns, true);

      expect(result).toBeCloseTo(0.3005, 4); // sample std * sqrt(252)
    });

    it('十分なデータがない場合はエラーを投げる', () => {
      expect(() => engine.calculateVolatility([0.01], false)).toThrow('At least two return values');
    });
  });

  describe('calculateCorrelation', () => {
    it('二系列のピアソン相関を計算する', () => {
      const series1 = [1, 2, 3, 4];
      const series2 = [2, 4, 6, 8];

      const correlation = engine.calculateCorrelation(series1, series2);

      expect(correlation).toBeCloseTo(1);
    });

    it('長さ不一致の場合はエラーを投げる', () => {
      expect(() => engine.calculateCorrelation([1, 2, 3], [1, 2])).toThrow('must have same length');
    });
  });

  describe('calculateDrawdown', () => {
    it('累積最大値を基準にドローダウン系列を計算する', () => {
      const values = [100, 120, 90, 150, 130];

      const result = engine.calculateDrawdown(values);

      expect(result.drawdowns).toEqual([0, 0, -0.25, 0, -0.13333333333333333]);
      expect(result.maxDrawdown).toBe(-0.25);
      expect(result.maxDrawdownPeriod).toEqual({ start: 1, end: 2 });
      expect(result.averageDrawdown).toBeCloseTo(-0.0766667, 6);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('超過リターンの平均をリターンの標準偏差で割って算出する', () => {
      const returns = [0.01, 0.02, -0.005, 0.015];

      const sharpe = engine.calculateSharpeRatio(returns, 0.001);

      expect(sharpe).toBeCloseTo(0.833, 3);
    });

    it('分散がゼロの場合はエラーを投げる', () => {
      expect(() => engine.calculateSharpeRatio([0.01, 0.01], 0.001)).toThrow(
        'Return variance must be greater than zero',
      );
    });
  });

  describe('calculateHistoricalVaR', () => {
    it('指定信頼水準のHistorical VaRを計算する', () => {
      const returns = [-0.02, 0.01, -0.03, 0.015, -0.01];

      const var95 = engine.calculateHistoricalVaR(returns, 0.95);

      expect(var95).toBeCloseTo(-0.03);
    });

    it('信頼水準が不正またはデータ不足ならエラー', () => {
      expect(() => engine.calculateHistoricalVaR([], 0.95)).toThrow('At least one return value');
      expect(() => engine.calculateHistoricalVaR([0.01], 1.1)).toThrow('confidence must be between 0 and 1');
    });
  });

  describe('calculateCorrelationMatrix', () => {
    it('複数系列の相関行列を計算する', () => {
      const series = [
        [0.1, 0.2, 0.3],
        [0.2, 0.4, 0.6],
        [-0.1, -0.2, -0.3],
      ];

      const matrix = engine.calculateCorrelationMatrix(series);

      expect(matrix).toHaveLength(3);
      expect(matrix[0][1]).toBeCloseTo(1);
      expect(matrix[0][2]).toBeCloseTo(-1);
      expect(matrix[1][2]).toBeCloseTo(-1);
    });

    it('系列長が一致しない場合はエラー', () => {
      expect(() => engine.calculateCorrelationMatrix([[1, 2], [1]])).toThrow(
        'All series must have the same length',
      );
    });
  });
});
