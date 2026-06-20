const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Node 24 TurboFan JIT crash: force single-threaded Metro bundling
config.maxWorkers = 1;

module.exports = config;
