module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@api': './src/api',
            '@audio': './src/audio',
            '@components': './src/components',
            '@config': './src/config',
            '@contexts': './src/contexts',
            '@db': './src/db',
            '@game': './src/game',
            '@hooks': './src/hooks',
            '@lib': './src/lib',
            '@navigation': './src/navigation',
            '@queries': './src/queries',
            '@screens': './src/screens',
            '@utils': './src/utils',
          },
        },
      ],
    ],
  };
};
