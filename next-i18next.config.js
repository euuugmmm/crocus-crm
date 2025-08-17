// next-i18next.config.js
const path = require("path");

module.exports = {
  i18n: {
    defaultLocale: "ru",
    locales: ["ru", "ua", "en"],
 
  },
  localePath: path.resolve("./public/locales"),
};