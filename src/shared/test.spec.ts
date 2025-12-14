import { ASSET_MANAGER_VERSION } from './index';

describe('Shared module', () => {
  it('should export version', () => {
    expect(ASSET_MANAGER_VERSION).toBe('0.1.0');
  });
});
