import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Server Host Resolution Logic', () => {
  it('should resolve to 127.0.0.1 when NODE_ENV is test and HOST is not provided', () => {
    const resolveHost = (envHost?: string, nodeEnv?: string) => {
      return envHost || (nodeEnv === 'test' ? '127.0.0.1' : '0.0.0.0');
    };

    assert.strictEqual(resolveHost(undefined, 'test'), '127.0.0.1');
  });

  it('should resolve to 0.0.0.0 when NODE_ENV is production and HOST is not provided', () => {
    const resolveHost = (envHost?: string, nodeEnv?: string) => {
      return envHost || (nodeEnv === 'test' ? '127.0.0.1' : '0.0.0.0');
    };

    assert.strictEqual(resolveHost(undefined, 'production'), '0.0.0.0');
  });

  it('should respect explicit HOST environment variable if provided', () => {
    const resolveHost = (envHost?: string, nodeEnv?: string) => {
      return envHost || (nodeEnv === 'test' ? '127.0.0.1' : '0.0.0.0');
    };

    assert.strictEqual(resolveHost('192.168.1.50', 'test'), '192.168.1.50');
    assert.strictEqual(resolveHost('127.0.0.1', 'production'), '127.0.0.1');
  });
});
