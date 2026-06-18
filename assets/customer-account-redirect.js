/**
 * Storefront tag routing backup for paths handled in Liquid.
 */
(function () {
  'use strict';

  if (document.body.dataset.customerLoggedIn !== 'true') return;

  var configEl = document.getElementById('customer-account-redirect-data');
  if (!configEl) return;

  var config;
  try {
    config = JSON.parse(configEl.textContent);
  } catch (error) {
    return;
  }

  if (config.skipRedirect) return;

  var params = new URLSearchParams(window.location.search);
  if (params.get('browse') === '1' || params.get('no_redirect') === '1') return;

  function normalizePath(path) {
    var value = path || '/';
    if (value.length > 1 && value.charAt(value.length - 1) === '/') {
      value = value.slice(0, -1);
    }
    return value || '/';
  }

  function redirectTo(url) {
    if (normalizePath(window.location.pathname) === normalizePath(url)) return;
    window.location.replace(url);
  }

  var current = normalizePath(config.currentPath || window.location.pathname);

  if (config.isWholesale) {
    if (
      current === normalizePath(config.homePath) ||
      current === normalizePath(config.wholesaleSignupPath) ||
      params.get('logged_in') === 'true'
    ) {
      redirectTo(config.wholesaleDashboardPath);
    }
    return;
  }

  if (config.isRetail) {
    if (current === normalizePath(config.wholesaleDashboardPath) || params.get('logged_in') === 'true') {
      redirectTo(config.homePath);
    }
  }
})();
