// fallow-ignore unused-dependencies — these are referenced via string in presets/plugins below
void require('babel-preset-expo');
void require('babel-plugin-module-resolver');

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
