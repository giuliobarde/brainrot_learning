const base = require('./eslint.base.cjs');

module.exports = {
  ...base,
  env: { node: true, es2022: true },
  rules: {
    ...base.rules,
  },
};
