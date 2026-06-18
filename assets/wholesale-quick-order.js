(function () {
  'use strict';

  function getCartAddUrl() {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    return root.replace(/\/?$/, '/') + 'cart/add.js';
  }

  function getSearchSuggestUrl(query) {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    var params = new URLSearchParams({
      q: query,
      'resources[type]': 'product',
      'resources[limit]': '10',
      'resources[options][fields]': 'variants.sku,title'
    });
    return root.replace(/\/?$/, '/') + 'search/suggest.json?' + params.toString();
  }

  function setFeedback(el, message, type) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('is-success', 'is-error');
    if (type) {
      el.classList.add('is-' + type);
    }
  }

  function addToCart(variantId, quantity) {
    return fetch(getCartAddUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        items: [{ id: Number(variantId), quantity: Number(quantity) || 1 }]
      })
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var error = new Error(data.description || data.message || 'Could not add to cart');
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  function refreshThemeCart() {
    document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));

    if (window.theme && window.theme.events) {
      try {
        window.theme.events.publish('quick-cart:updated');
      } catch (e) {
        /* theme event bus may not be exposed */
      }
    }
  }

  function getProductJsonUrl(handle) {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    return root.replace(/\/?$/, '/') + 'products/' + handle + '.js';
  }

  function findVariantBySku(sku) {
    var normalized = String(sku || '').trim().toLowerCase();
    if (!normalized) {
      return Promise.reject(new Error('Enter a SKU'));
    }

    return fetch(getSearchSuggestUrl(normalized))
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        var products = (data.resources && data.resources.results && data.resources.results.products) || [];
        if (!products.length) {
          throw new Error('No product found for that SKU');
        }

        var handles = products
          .map(function (product) {
            return product.handle;
          })
          .filter(Boolean);

        return Promise.all(
          handles.map(function (handle) {
            return fetch(getProductJsonUrl(handle)).then(function (res) {
              return res.json();
            });
          })
        ).then(function (fullProducts) {
          for (var i = 0; i < fullProducts.length; i += 1) {
            var variant = (fullProducts[i].variants || []).find(function (v) {
              return String(v.sku || '').trim().toLowerCase() === normalized;
            });

            if (variant) {
              if (!variant.available) {
                throw new Error('That product is currently sold out');
              }
              return variant;
            }
          }

          throw new Error('No product found for that SKU');
        });
      });
  }

  function initProductItems(root) {
    root.querySelectorAll('[data-quick-order-item]').forEach(function (item) {
      var variantSelect = item.querySelector('[data-variant-select]');
      var qtyInput = item.querySelector('[data-qty-input]');
      var addBtn = item.querySelector('[data-add-to-cart]');
      var feedback = item.querySelector('[data-item-feedback]');
      var priceValue = item.querySelector('[data-item-price-value]');
      var skuEl = item.querySelector('.wholesale-quick-order__item-sku');
      var variantsJson = item.querySelector('[data-product-variants]');
      var variants = [];

      if (variantsJson) {
        try {
          variants = JSON.parse(variantsJson.textContent);
        } catch (e) {
          variants = [];
        }
      }

      if (variantSelect && variantSelect.tagName === 'SELECT') {
        variantSelect.addEventListener('change', function () {
          var selectedId = Number(variantSelect.value);
          var variant = variants.find(function (v) {
            return Number(v.id) === selectedId;
          });

          if (!variant) return;

          if (priceValue && variant.price != null) {
            priceValue.textContent = formatMoney(variant.price);
          }

          if (skuEl) {
            if (variant.sku) {
              skuEl.textContent = 'SKU: ' + variant.sku;
              skuEl.hidden = false;
            } else {
              skuEl.hidden = true;
            }
          }

          if (addBtn) {
            var available = variant.available;
            addBtn.disabled = !available;
            addBtn.setAttribute('aria-disabled', available ? 'false' : 'true');
            var textEl = addBtn.querySelector('[data-add-to-cart-text]');
            if (textEl) {
              textEl.textContent = available ? 'Add to cart' : 'Sold out';
            }
          }

          setFeedback(feedback, '', null);
        });
      }

      if (addBtn) {
        addBtn.addEventListener('click', function () {
          if (addBtn.disabled || addBtn.classList.contains('is-loading')) return;

          var variantId = variantSelect ? variantSelect.value : null;
          var quantity = qtyInput ? qtyInput.value : 1;

          if (!variantId) {
            setFeedback(feedback, 'Select a variant', 'error');
            return;
          }

          addBtn.classList.add('is-loading');
          setFeedback(feedback, '', null);

          addToCart(variantId, quantity)
            .then(function () {
              addBtn.classList.remove('is-loading');
              addBtn.classList.add('is-success');
              setFeedback(feedback, 'Added to cart', 'success');
              refreshThemeCart();

              window.setTimeout(function () {
                addBtn.classList.remove('is-success');
              }, 1500);
            })
            .catch(function (error) {
              addBtn.classList.remove('is-loading');
              setFeedback(feedback, error.message || 'Could not add to cart', 'error');
            });
        });
      }
    });
  }

  function formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents);
    }

    return '$' + (Number(cents) / 100).toFixed(2);
  }

  function initSkuSearch(root) {
    var form = root.querySelector('[data-sku-form]');
    if (!form) return;

    var input = form.querySelector('[data-sku-input]');
    var qtyInput = form.querySelector('[data-sku-qty]');
    var submitBtn = form.querySelector('[data-sku-submit]');
    var feedback = root.querySelector('[data-sku-feedback]');

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (submitBtn && submitBtn.disabled) return;

      var sku = input ? input.value : '';
      var quantity = qtyInput ? qtyInput.value : 1;

      if (submitBtn) submitBtn.disabled = true;
      setFeedback(feedback, 'Searching…', null);

      findVariantBySku(sku)
        .then(function (variant) {
          return addToCart(variant.id, quantity);
        })
        .then(function () {
          setFeedback(feedback, 'Added to cart', 'success');
          refreshThemeCart();
          if (input) input.value = '';
        })
        .catch(function (error) {
          setFeedback(feedback, error.message || 'Could not find product', 'error');
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function initWholesaleQuickOrder() {
    var root = document.querySelector('[data-wholesale-quick-order]');
    if (!root) return;

    initProductItems(root);
    initSkuSearch(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWholesaleQuickOrder);
  } else {
    initWholesaleQuickOrder();
  }
})();
