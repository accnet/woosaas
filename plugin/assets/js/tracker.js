/**
 * Woosaas Analytics Tracker
 * Client-side JavaScript tracker
 */

(function(window, document) {
    'use strict';

    var WoosaasTracker = function() {
        this.config = window.woosaas_config || {};
        this.queue = window.woosaas ? window.woosaas.q : [];
        this.clientId = null;
        this.sessionId = null;
        this.attribution = null;
        
        this.init();
    };

    WoosaasTracker.prototype.init = function() {
        var self = this;
        
        // Generate or retrieve client ID
        this.clientId = this.getCookie('woosaas_client_id');
        if (!this.clientId) {
            this.clientId = this.generateId();
            this.setCookie('woosaas_client_id', this.clientId, 365);
        }
        
        // Generate or retrieve session ID
        var existingSession = this.getCookie('woosaas_session_id');
        this.sessionId = existingSession || this.generateId();
        this.setCookie('woosaas_session_id', this.sessionId, 0.020833); // 30 minutes
        
        // Load attribution
        this.attribution = this.getAttribution();

        if (!existingSession) {
            this.track('session_start', {
                url: window.location.href,
                path: window.location.pathname
            });
        }

        // Track one pageview for every page load.
        this.track('pageview', {
            url: window.location.href,
            path: window.location.pathname
        });

        if (this.config.product && this.config.product.product_id) {
            this.track('product_view', {
                url: window.location.href,
                path: window.location.pathname,
                product_id: this.config.product.product_id,
                product_name: this.config.product.product_name || ''
            });
        }
        
        // Process queued events
        this.queue.forEach(function(args) {
            self.processCommand(args);
        });
        
        // Setup page visibility tracking
        this.setupVisibilityTracking();
        
        // Setup scroll tracking
        this.setupScrollTracking();
    };

    WoosaasTracker.prototype.track = function(eventName, properties) {
        if (!this.config.api_key) {
            return;
        }

        properties = properties || {};
        var eventProperties = Object.assign({}, properties);

        var event = {
            event_id: this.generateId(),
            event_time: new Date().toISOString(),
            event_name: eventName,
            client_id: this.clientId,
            session_id: this.sessionId,
            url: properties.url || window.location.href,
            path: properties.path || window.location.pathname,
            referrer: document.referrer,
            user_agent: navigator.userAgent,
            attribution: this.attribution,
            properties: eventProperties
        };

        // Add product data if available
        if (properties.product_id) {
            event.product_id = properties.product_id;
            event.product_name = properties.product_name;
            event.quantity = properties.quantity;
            event.revenue = properties.revenue;
            event.currency = properties.currency;
            delete event.properties.product_id;
            delete event.properties.product_name;
            delete event.properties.quantity;
            delete event.properties.revenue;
            delete event.properties.currency;
        }

        this.send(event);
    };

    WoosaasTracker.prototype.processCommand = function(args) {
        if (!args || !args.length) {
            return;
        }

        if (args[0] === 'track') {
            this.track(args[1], args[2] || {});
            return;
        }

        this.track(args[0], args[1] || {});
    };

    WoosaasTracker.prototype.send = function(event) {
        var payload = JSON.stringify(event);
        // sendBeacon does not support custom headers, pass api_key in query param
        var url = this.config.api_url + '/api/v1/collect?api_key=' + encodeURIComponent(this.config.api_key);
        
        if (navigator.sendBeacon) {
            var blob = new Blob([payload], {type: 'application/json'});
            navigator.sendBeacon(url, blob);
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(payload);
        }
    };

    WoosaasTracker.prototype.sendBatch = function(events) {
        var self = this;
        var payload = JSON.stringify({events: events});
        
        var xhr = new XMLHttpRequest();
        xhr.open('POST', this.config.api_url + '/api/v1/collect/batch', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Api-Key', this.config.api_key);
        xhr.send(payload);
    };

    WoosaasTracker.prototype.getAttribution = function() {
        var attrCookie = this.getCookie('woosaas_attribution');
        if (attrCookie) {
            try {
                return JSON.parse(attrCookie);
            } catch (e) {
                return null;
            }
        }
        
        // Parse UTM parameters
        var attribution = this.parseUtmParams();
        if (attribution) {
            // Check for click IDs
            var clickIds = this.parseClickIds();
            Object.assign(attribution, clickIds);
            
            // Save attribution
            this.setCookie('woosaas_attribution', JSON.stringify(attribution), 90);
        }
        
        return attribution;
    };

    WoosaasTracker.prototype.parseUtmParams = function() {
        var params = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        var attribution = {};
        var hasUtm = false;

        params.forEach(function(param) {
            var value = this.getQueryParam(param);
            if (value) {
                attribution[param] = value;
                hasUtm = true;
            }
        }, this);

        // If no UTM, check referrer
        if (!hasUtm && document.referrer) {
            var referrer = document.referrer;
            if (referrer.includes('google.com')) {
                attribution.source = 'google';
                attribution.medium = 'organic';
            } else if (referrer.includes('facebook.com') || referrer.includes('twitter.com')) {
                attribution.source = this.getDomain(referrer);
                attribution.medium = 'social';
            } else {
                attribution.source = this.getDomain(referrer);
                attribution.medium = 'referral';
            }
        }

        return Object.keys(attribution).length > 0 ? attribution : null;
    };

    WoosaasTracker.prototype.parseClickIds = function() {
        return {
            gclid: this.getQueryParam('gclid'),
            fbclid: this.getQueryParam('fbclid'),
            ttclid: this.getQueryParam('ttclid'),
            msclkid: this.getQueryParam('msclkid')
        };
    };

    WoosaasTracker.prototype.getQueryParam = function(name) {
        var urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    };

    WoosaasTracker.prototype.getDomain = function(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return url;
        }
    };

    WoosaasTracker.prototype.getCookie = function(name) {
        var value = '; ' + document.cookie;
        var parts = value.split('; ' + name + '=');
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    };

    WoosaasTracker.prototype.setCookie = function(name, value, days) {
        var expires = '';
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toUTCString();
        }
        var domain = this.config.cookie_domain || '';
        document.cookie = name + '=' + value + expires + '; path=/' + 
            (domain ? '; domain=' + domain : '') + '; SameSite=Lax';
    };

    WoosaasTracker.prototype.generateId = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    WoosaasTracker.prototype.setupVisibilityTracking = function() {
        var self = this;
        var hiddenTime = 0;
        var lastHiddenTime = Date.now();

        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                lastHiddenTime = Date.now();
            } else {
                hiddenTime += Date.now() - lastHiddenTime;
            }
        });
    };

    WoosaasTracker.prototype.setupScrollTracking = function() {
        var self = this;
        var maxScroll = 0;
        
        window.addEventListener('scroll', function() {
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            var docHeight = document.documentElement.scrollHeight - window.innerHeight;
            var scrollPercent = Math.round((scrollTop / docHeight) * 100);
            
            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;
                
                // Track 25%, 50%, 75%, 100% scroll milestones
                if ([25, 50, 75, 100].indexOf(scrollPercent) !== -1) {
                    self.track('scroll_depth', {
                        scroll_percent: scrollPercent
                    });
                }
            }
        });
    };

    // Initialize tracker
    var existingQueue = window.woosaas && window.woosaas.q ? window.woosaas.q : [];

    window.woosaas = function() {
        var args = Array.prototype.slice.call(arguments);
        if (!window.woosaas.q) {
            window.woosaas.q = [];
        }

        window.woosaas.q.push(args);
    };
    window.woosaas.q = existingQueue;
    
    window.woosaas.track = function(eventName, properties) {
        if (window._woosaasTracker) {
            window._woosaasTracker.track(eventName, properties);
            return;
        }

        window.woosaas('track', eventName, properties || {});
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window._woosaasTracker = new WoosaasTracker();
        });
    } else {
        window._woosaasTracker = new WoosaasTracker();
    }

})(window, document);