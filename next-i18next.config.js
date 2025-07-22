// next-i18next.config.js
const path = require("path");

module.exports = {
  i18n: {
    defaultLocale: "ru",
    locales: ["en", "ru", "ua"],
 
  },
  localePath: path.resolve("./public/locales"),
};