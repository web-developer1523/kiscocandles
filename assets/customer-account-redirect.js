/**
 * Storefront tag routing backup for paths handled in Liquid.
 */
(function () {
  'use strict';

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

  function isAccountPath(path) {
    return path.indexOf('/account') === 0 || path.indexOf('/customer_authentication') === 0;
  }

  function isRetailHome(path) {
    var home = normalizePath(config.homePath || '/');
    return path === home || path === '/';
  }

  var current = normalizePath(config.currentPath || window.location.pathname);
  var wholesaleHome = normalizePath(config.wholesaleHomePath || '/pages/wholesale-home');

  if (!config.isWholesale) {
    if (current === wholesaleHome) {
      redirectTo(config.homePath || '/');
    }
  }

  if (config.isWholesale) {
    if (isAccountPath(current)) {
      redirectTo(config.wholesaleDashboardPath);
      return;
    }
    if (isRetailHome(current)) {
      redirectTo(config.wholesaleHomePath);
    }
    return;
  }

  if (config.isRetail) {
    if (
      current === normalizePath(config.wholesaleDashboardPath) ||
      current === wholesaleHome
    ) {
      redirectTo(config.homePath || '/');
    }
  }
})();
