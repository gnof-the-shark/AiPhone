// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

function withEnv(overrides, fn) {
  const keys = ['API_TOKEN', 'CLAWPHONE_API_KEY', 'CLAW_API_KEY'];
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  for (const key of keys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of keys) delete process.env[key];
      for (const [key, value] of Object.entries(previous)) {
        if (value !== undefined) process.env[key] = value;
      }
    });
}

async function loadConfigFresh() {
  return import(`../lib/config.mjs?t=${Date.now()}-${Math.random()}`);
}

test('config: falls back to CLAW_API_KEY for CLAWPHONE_API_KEY', async () => {
  await withEnv({ CLAW_API_KEY: 'alias-key' }, async () => {
    const config = await loadConfigFresh();
    assert.equal(config.CLAWPHONE_API_KEY, 'alias-key');
    assert.equal(config.API_TOKEN, 'alias-key');
  });
});

test('config: CLAWPHONE_API_KEY takes precedence over CLAW_API_KEY', async () => {
  await withEnv({ CLAWPHONE_API_KEY: 'primary-key', CLAW_API_KEY: 'alias-key' }, async () => {
    const config = await loadConfigFresh();
    assert.equal(config.CLAWPHONE_API_KEY, 'primary-key');
    assert.equal(config.API_TOKEN, 'primary-key');
  });
});

test('config: explicit API_TOKEN overrides derived key', async () => {
  await withEnv({ CLAW_API_KEY: 'alias-key', API_TOKEN: 'custom-token' }, async () => {
    const config = await loadConfigFresh();
    assert.equal(config.CLAWPHONE_API_KEY, 'alias-key');
    assert.equal(config.API_TOKEN, 'custom-token');
  });
});
