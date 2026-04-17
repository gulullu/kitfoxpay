const path = require('node:path');

function createConfigLoader({ baseDir = path.resolve(__dirname, '..') } = {}) {
  const configPath = path.join(baseDir, 'config.js');
  const examplePath = path.join(baseDir, 'config.example.js');

  function load() {
    let targetPath = configPath;
    try {
      delete require.cache[require.resolve(configPath)];
      return require(configPath);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
      targetPath = examplePath;
      delete require.cache[require.resolve(examplePath)];
      return require(examplePath);
    }
  }

  return {
    load,
    getConfigPath() {
      return configPath;
    },
    getExamplePath() {
      return examplePath;
    },
  };
}

const defaultLoader = createConfigLoader();

module.exports = {
  createConfigLoader,
  loadConfig: () => defaultLoader.load(),
  getConfigPath: () => defaultLoader.getConfigPath(),
  getExamplePath: () => defaultLoader.getExamplePath(),
};
