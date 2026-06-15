(function () {
  'use strict';

  function initWholesaleDashboard() {
    var dashboard = document.querySelector('[data-wholesale-dashboard]');
    if (!dashboard) return;

    var toggle = dashboard.querySelector('[data-sidebar-toggle]');
    var sidebar = dashboard.querySelector('[data-sidebar]');
    var overlay = dashboard.querySelector('[data-sidebar-overlay]');

    function openSidebar() {
      if (!sidebar) return;
      sidebar.classList.add('is-open');
      if (overlay) overlay.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      if (!sidebar) return;
      sidebar.classList.remove('is-open');
      if (overlay) overlay.classList.remove('is-visible');
      document.body.style.overflow = '';
    }

    if (toggle && sidebar) {
      toggle.addEventListener('click', function () {
        var isOpen = sidebar.classList.contains('is-open');
        if (isOpen) {
          closeSidebar();
          toggle.setAttribute('aria-expanded', 'false');
        } else {
          openSidebar();
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }

    var navLinks = dashboard.querySelectorAll('.wholesale-dashboard__nav-link');
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      });
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) {
        closeSidebar();
      }
    });

    validateCertificateLinks(dashboard);
    initQuickActionCards(dashboard);

    var sinceTargets = dashboard.querySelectorAll('[data-customer-since]');
    var needsSinceDate = false;

    sinceTargets.forEach(function (el) {
      if (!el.textContent.trim()) {
        needsSinceDate = true;
      }
    });

    if (needsSinceDate) {
      initCustomerSince(dashboard);
    }
  }

  function formatCustomerSinceDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function setCustomerSinceText(formattedDate) {
    if (!formattedDate) return;

    document.querySelectorAll('[data-customer-since]').forEach(function (el) {
      if (!el.textContent.trim()) {
        el.textContent = formattedDate;
      }
    });
  }

  function getEventTimestamp(event) {
    if (!event) return null;

    return (
      event.occurred_at ||
      event.occurredAt ||
      event.created_at ||
      event.createdAt ||
      event.date ||
      event.timestamp ||
      null
    );
  }

  function findRegistrationEventDate(events) {
    if (!events || !events.length) return null;

    var preferred = null;
    var earliest = null;

    events.forEach(function (event) {
      var timestamp = getEventTimestamp(event);
      if (!timestamp) return;

      var name = String(event.name || event.key || event.type || event.title || '').toLowerCase();

      if (
        name.indexOf('customer_created') !== -1 ||
        name.indexOf('customer created') !== -1 ||
        name.indexOf('registration') !== -1 ||
        name.indexOf('submitted') !== -1 ||
        name.indexOf('b2b') !== -1
      ) {
        if (!preferred || new Date(timestamp) < new Date(preferred)) {
          preferred = timestamp;
        }
      }

      if (!earliest || new Date(timestamp) < new Date(earliest)) {
        earliest = timestamp;
      }
    });

    return preferred || earliest;
  }

  function loadCustomerSinceFromHelium() {
    if (!window.CF || !window.CF.customer || typeof window.CF.customer.events !== 'function') {
      return Promise.resolve(null);
    }

    return window.CF.customer.events().then(function (events) {
      return findRegistrationEventDate(events);
    }).catch(function () {
      return null;
    });
  }

  function whenHeliumReady(callback) {
    if (window.CF && window.CF.customer) {
      callback();
      return;
    }

    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;

      if (window.CF && window.CF.customer) {
        window.clearInterval(timer);
        callback();
      } else if (attempts >= 40) {
        window.clearInterval(timer);
      }
    }, 250);

    document.addEventListener('cf:customer_ready', callback, { once: true });
  }

  function initCustomerSince(dashboard) {
    var sinceEls = dashboard.querySelectorAll('[data-customer-since]');
    var hasValue = false;

    sinceEls.forEach(function (el) {
      if (el.textContent.trim()) {
        hasValue = true;
      }
    });

    if (hasValue) return;

    whenHeliumReady(function () {
      loadCustomerSinceFromHelium().then(function (timestamp) {
        if (timestamp) {
          setCustomerSinceText(formatCustomerSinceDate(timestamp));
        }
      });
    });
  }

  function validateCertificateLinks(dashboard) {
    var certificateLinks = dashboard.querySelectorAll('[data-certificate-download]');

    certificateLinks.forEach(function (link) {
      var href = link.getAttribute('href');

      if (!href || href === '#' || href === '') {
        link.classList.add('is-disabled');
        link.setAttribute('aria-disabled', 'true');
        link.removeAttribute('href');
        return;
      }

      try {
        var url = new URL(href, window.location.origin);
        if (!url.protocol.startsWith('http')) {
          link.classList.add('is-disabled');
          link.setAttribute('aria-disabled', 'true');
        }
      } catch (e) {
        link.classList.add('is-disabled');
        link.setAttribute('aria-disabled', 'true');
        link.removeAttribute('href');
      }
    });
  }

  function initQuickActionCards(dashboard) {
    var actionCards = dashboard.querySelectorAll('.wholesale-dashboard__action');

    actionCards.forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        if (!card.classList.contains('is-disabled')) {
          card.style.transform = 'translateY(-2px)';
        }
      });

      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWholesaleDashboard);
  } else {
    initWholesaleDashboard();
  }
})();
