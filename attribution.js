(function () {
  'use strict';

  var CALENDLY_HOST = 'calendly.com';
  var CALENDLY_PATH = '/jimmy-incidentfox/15-min-quick-chat-incidentfox';
  var FIRST_TOUCH_KEY = 'mindbill_attribution_first_v1';
  var LAST_TOUCH_KEY = 'mindbill_attribution_last_v1';
  var ATTRIBUTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'li_fat_id', 'fbclid', 'msclkid'];

  function clean(value) {
    return String(value || '').trim().slice(0, 254);
  }

  function normalizedPath() {
    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    return path || '/';
  }

  function variantFor(path) {
    if (path === '/') return 'homepage';
    return path.replace(/^\//, '').replace(/\//g, '-');
  }

  function readStored(key) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      if (!value || !value.captured_at) return null;
      var capturedAt = new Date(value.captured_at).getTime();
      if (!isFinite(capturedAt) || Date.now() - capturedAt > ATTRIBUTION_WINDOW_MS) return null;
      return value;
    } catch (e) {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function referrerAttribution() {
    if (!document.referrer) return null;
    try {
      var host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, '');
      if (!host || host === location.hostname.toLowerCase().replace(/^www\./, '')) return null;
      if (/(^|\.)google\./.test(host)) return { utm_source: 'google', utm_medium: 'organic' };
      if (/(^|\.)bing\.com$/.test(host)) return { utm_source: 'bing', utm_medium: 'organic' };
      if (/(^|\.)linkedin\.com$/.test(host)) return { utm_source: 'linkedin', utm_medium: 'organic_social' };
      if (/(^|\.)(facebook|instagram)\.com$/.test(host)) return { utm_source: 'meta', utm_medium: 'organic_social' };
      return { utm_source: host, utm_medium: 'referral' };
    } catch (e) {
      return null;
    }
  }

  function currentTouch() {
    var query = new URLSearchParams(location.search);
    var touch = {};
    var hasCampaignSignal = false;

    UTM_KEYS.forEach(function (key) {
      if (!query.has(key)) return;
      touch[key] = clean(query.get(key));
      hasCampaignSignal = true;
    });

    CLICK_IDS.forEach(function (key) {
      if (!query.has(key)) return;
      touch['has_' + key] = true;
      hasCampaignSignal = true;
    });

    if (!touch.utm_source) {
      if (touch.has_gclid || touch.has_gbraid || touch.has_wbraid) touch.utm_source = 'google';
      else if (touch.has_li_fat_id) touch.utm_source = 'linkedin';
      else if (touch.has_fbclid) touch.utm_source = 'meta';
      else if (touch.has_msclkid) touch.utm_source = 'microsoft';
    }

    if (!touch.utm_medium && hasCampaignSignal) {
      if (touch.utm_source === 'google' || touch.utm_source === 'microsoft') touch.utm_medium = 'paid_search';
      else if (touch.utm_source === 'linkedin' || touch.utm_source === 'meta') touch.utm_medium = 'paid_social';
    }

    if (!hasCampaignSignal) {
      var referral = referrerAttribution();
      if (referral) {
        touch.utm_source = referral.utm_source;
        touch.utm_medium = referral.utm_medium;
        hasCampaignSignal = true;
      }
    }

    touch.landing_path = normalizedPath();
    touch.landing_variant = variantFor(touch.landing_path);
    touch.captured_at = new Date().toISOString();
    touch.has_campaign_signal = hasCampaignSignal;
    return touch;
  }

  function eventFields(touch) {
    return {
      page_variant: touch.landing_variant || variantFor(normalizedPath()),
      page_path: normalizedPath(),
      traffic_source: touch.utm_source || 'mindbill',
      traffic_medium: touch.utm_medium || 'website',
      campaign_name: touch.utm_campaign || '',
      campaign_term: touch.utm_term || '',
      campaign_content: touch.utm_content || ''
    };
  }

  function pushEvent(name, touch, extras) {
    window.dataLayer = window.dataLayer || [];
    var payload = eventFields(touch);
    payload.event = name;
    Object.keys(extras || {}).forEach(function (key) { payload[key] = extras[key]; });
    window.dataLayer.push(payload);
  }

  var incoming = currentTouch();
  var firstTouch = readStored(FIRST_TOUCH_KEY);
  var lastTouch = readStored(LAST_TOUCH_KEY);

  if (!firstTouch) {
    firstTouch = incoming;
    writeStored(FIRST_TOUCH_KEY, firstTouch);
  }
  if (incoming.has_campaign_signal || !lastTouch) {
    lastTouch = incoming;
    writeStored(LAST_TOUCH_KEY, lastTouch);
  }

  var activeTouch = lastTouch || incoming;
  window.MindBillAttribution = {
    firstTouch: firstTouch,
    lastTouch: activeTouch
  };

  function calendlyUrlFor(link) {
    try {
      var url = new URL(link.href);
      if (url.hostname !== CALENDLY_HOST || url.pathname.replace(/\/$/, '') !== CALENDLY_PATH) return null;

      var source = activeTouch.utm_source || 'mindbill';
      var medium = activeTouch.utm_medium || 'website';
      var campaign = activeTouch.utm_campaign || 'mindbill_site';
      var content = activeTouch.utm_content || '';
      var variantMarker = 'lp_' + (activeTouch.landing_variant || variantFor(normalizedPath()));

      if (!content) content = variantMarker;
      else if (content.indexOf('__lp_') === -1) content = clean(content + '__' + variantMarker);

      url.searchParams.set('utm_source', source);
      url.searchParams.set('utm_medium', medium);
      url.searchParams.set('utm_campaign', campaign);
      url.searchParams.set('utm_content', content);
      if (activeTouch.utm_term) url.searchParams.set('utm_term', activeTouch.utm_term);
      return url;
    } catch (e) {
      return null;
    }
  }

  function wireCalendlyLinks() {
    var links = document.querySelectorAll('a[href*="calendly.com/jimmy-incidentfox/15-min-quick-chat-incidentfox"]');
    links.forEach(function (link, index) {
      var url = calendlyUrlFor(link);
      if (!url) return;
      link.href = url.toString();
      link.dataset.attributionReady = 'true';
      link.addEventListener('click', function () {
        pushEvent('book_demo_click', activeTouch, {
          cta_index: index + 1,
          cta_text: clean(link.textContent).slice(0, 80)
        });
      });
    });
    document.documentElement.dataset.attributionReady = 'true';
  }

  pushEvent('campaign_landing_view', activeTouch);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireCalendlyLinks);
  else wireCalendlyLinks();
})();
