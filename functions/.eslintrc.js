module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2020, // or a later version like 2021, 2022
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "quotes": ["error", "double"],
    "max-len": "off", // Temporarily disable max-len rule
    "indent": "off", // Temporarily disable indent rule
    "comma-dangle": "off", // Temporarily disable comma-dangle rule
    "arrow-parens": "off", // Temporarily disable arrow-parens rule
  },
};
