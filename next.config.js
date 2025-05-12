/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');

const nextConfig = {
  reactStrictMode: true,
  i18n
  // Additional config (if needed) can be added here.
};

module.exports = nextConfig;