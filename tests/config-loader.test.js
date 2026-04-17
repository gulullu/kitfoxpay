const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createConfigLoader } = require('../lib/config-loader');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kitfoxpay-config-'));
}

test('config loader falls back to example config when config.js is missing', () => {
  const tempDir = makeTempDir();
  fs.writeFileSync(
    path.join(tempDir, 'config.example.js'),
    "module.exports = { server: { port: 9219 }, admin: { password: 'x' } };\n",
    'utf8'
  );

  const loader = createConfigLoader({ baseDir: tempDir });
  const config = loader.load();

  assert.equal(config.server.port, 9219);
  assert.equal(loader.getConfigPath(), path.join(tempDir, 'config.js'));
});

test('config loader reloads updated config.js content', () => {
  const tempDir = makeTempDir();
  fs.writeFileSync(
    path.join(tempDir, 'config.example.js'),
    "module.exports = { server: { port: 9219 }, admin: { password: 'x' } };\n",
    'utf8'
  );
  const configPath = path.join(tempDir, 'config.js');
  fs.writeFileSync(configPath, "module.exports = { server: { port: 1001 }, admin: { password: 'a' } };\n", 'utf8');

  const loader = createConfigLoader({ baseDir: tempDir });
  assert.equal(loader.load().server.port, 1001);

  fs.writeFileSync(configPath, "module.exports = { server: { port: 1002 }, admin: { password: 'b' } };\n", 'utf8');
  assert.equal(loader.load().server.port, 1002);
});
