const base = require('./eslint.base.cjs');

module.exports = {
  ...base,
  env: { browser: true, es2022: true, 'react-native/react-native': true },
  plugins: [...base.plugins, 'react', 'react-hooks', 'react-native'],
  extends: [
    ...base.extends,
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react-native/all',
  ],
  settings: {
    ...base.settings,
    react: { version: 'detect' },
  },
  rules: {
    ...base.rules,
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react-native/no-raw-text': 'off',
    'react-native/sort-styles': 'off',
    'react-native/no-color-literals': 'off',
    'react-native/no-inline-styles': 'warn',
    'react-native/no-unused-styles': 'warn',
  },
};
