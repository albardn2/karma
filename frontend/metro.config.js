
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude problematic lightningcss platform-specific files
config.resolver.blockList = [
  /node_modules\/\.lightningcss-.*$/,
  /.*\.lightningcss-.*$/
];

module.exports = config;
