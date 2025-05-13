// next-i18next.config.js
const path = require("path");

module.exports = {
  i18n: {
    defaultLocale: "ua",
    locales: ["en", "ru", "ua"],
 
  },
  localePath: path.resolve("./public/locales"),
};