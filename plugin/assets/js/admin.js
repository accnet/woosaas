(function($) {
    'use strict';

    var debugHistoryKey = 'woosaasDebugHistory';

    function setStep(step) {
        $('[data-step-panel]').each(function() {
            var $panel = $(this);
            var isActive = String($panel.data('step-panel')) === String(step);
            $panel.toggleClass('is-active', isActive);
            $panel.prop('hidden', !isActive);
        });

        $('[data-step-target]').each(function() {
            var $trigger = $(this);
            var isActive = String($trigger.data('step-target')) === String(step);
            if ($trigger.hasClass('woosaas-wizard__tab')) {
                $trigger.toggleClass('is-active', isActive);
            }
        });
    }

    function renderNotice($target, type, message, response) {
        var html = '<div class="notice notice-' + type + ' inline"><p>' + $('<div>').text(message).html() + '</p>';

        if (response) {
            html += '<pre class="woosaas-response-box">' + $('<div>').text(JSON.stringify(response, null, 2)).html() + '</pre>';
        }

        html += '</div>';
        $target.html(html);
    }

    function getHistory() {
        try {
            return JSON.parse(window.localStorage.getItem(debugHistoryKey) || '[]');
        } catch (error) {
            return [];
        }
    }

    function setHistory(history) {
        window.localStorage.setItem(debugHistoryKey, JSON.stringify(history.slice(0, 8)));
    }

    function addHistoryEntry(entry) {
        var history = getHistory();
        history.unshift(entry);
        setHistory(history);
        renderHistory();
    }

    function renderHistory() {
        var $container = $('#woosaas-debug-history');
        var history = getHistory();

        if (!$container.length) {
            return;
        }

        if (!history.length) {
            $container.html('<div class="woosaas-history__empty">No debug responses recorded yet.</div>');
            return;
        }

        var html = history.map(function(entry) {
            var response = entry.response ? '<pre class="woosaas-response-box">' + $('<div>').text(JSON.stringify(entry.response, null, 2)).html() + '</pre>' : '';
            return '' +
                '<article class="woosaas-history__item">' +
                    '<div class="woosaas-history__meta">' +
                        '<strong>' + $('<div>').text(entry.eventName).html() + '</strong>' +
                        '<span class="woosaas-history__badge is-' + $('<div>').text(entry.status).html() + '">' + $('<div>').text(entry.status).html() + '</span>' +
                    '</div>' +
                    '<p>' + $('<div>').text(entry.message).html() + '</p>' +
                    '<time>' + $('<div>').text(entry.time).html() + '</time>' +
                    response +
                '</article>';
        }).join('');

        $container.html(html);
    }

    function copyTarget(targetSelector, $button) {
        var element = document.querySelector(targetSelector);
        var originalText = $button.text();

        if (!element) {
            return;
        }

        element.focus();
        element.select();
        document.execCommand('copy');
        $button.text('Copied');

        window.setTimeout(function() {
            $button.text(originalText);
        }, 1200);
    }

    function upsertBadge(selector, text, variant) {
        var $badge = $(selector);

        if (!$badge.length) {
            return;
        }

        $badge
            .removeClass('is-fresh is-warm is-stale')
            .addClass(variant)
            .text(text)
            .show();
    }

    $(function() {
        renderHistory();

        $(document).on('click', '[data-step-target]', function() {
            setStep($(this).data('step-target'));
        });

        $(document).on('click', '[data-copy-target]', function() {
            copyTarget($(this).data('copy-target'), $(this));
        });

        $(document).on('click', '#woosaas-verify-btn', function() {
            var $btn = $(this);
            var $result = $('#woosaas-verify-result');

            $btn.prop('disabled', true).text(woosaasAdmin.messages.verifying);
            $result.empty();

            $.ajax({
                url: woosaasAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'woosaas_verify_api',
                    nonce: woosaasAdmin.verifyNonce,
                    api_url: $('#woosaas_api_url').val(),
                    api_key: $('#woosaas_api_key').val()
                }
            }).done(function(response) {
                if (response.success) {
                    if (response.data.siteId) {
                        $('#woosaas_verified_site_id').val(response.data.siteId);
                        $('#woosaas-last-verified-site').text(woosaasAdmin.messages.verifiedSitePrefix + ' ' + response.data.siteId);
                    }
                    if (response.data.verifiedAt) {
                        $('#woosaas-last-verified-at').text(response.data.verifiedAt);
                        upsertBadge('#woosaas-last-verified-badge', woosaasAdmin.messages.justNow, 'is-fresh');
                    }
                    if (response.data.trackingCode) {
                        $('#woosaas_tracking_code').val(response.data.trackingCode);
                    }
                    renderNotice($result, 'success', response.data.message, response.data.response || null);
                } else {
                    renderNotice($result, 'error', response.data.message, response.data.response || null);
                }
            }).fail(function() {
                renderNotice($result, 'error', woosaasAdmin.messages.verifyError);
            }).always(function() {
                $btn.prop('disabled', false).text(woosaasAdmin.messages.verifyDefault);
            });
        });

        $(document).on('click', '.woosaas-debug-button', function() {
            var $btn = $(this);
            var $result = $('#woosaas-debug-result');
            var originalText = $btn.text();

            $btn.prop('disabled', true).text(woosaasAdmin.messages.sending);
            $result.empty();

            $.ajax({
                url: woosaasAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'woosaas_send_debug_event',
                    nonce: woosaasAdmin.debugNonce,
                    event_name: $btn.data('event-name')
                }
            }).done(function(response) {
                if (response.success) {
                    if (response.data.debuggedAt) {
                        $('#woosaas-last-debug-at').text(response.data.debuggedAt);
                        $('#woosaas-debug-page-last-at').text(response.data.debuggedAt);
                        upsertBadge('#woosaas-last-debug-badge', woosaasAdmin.messages.justNow, 'is-fresh');
                        upsertBadge('#woosaas-debug-page-last-badge', woosaasAdmin.messages.justNow, 'is-fresh');
                    }
                    $('#woosaas-last-debug-name').text(woosaasAdmin.messages.latestEventPrefix + ' ' + $btn.data('event-name'));
                    $('#woosaas-debug-page-last-name').text(woosaasAdmin.messages.latestEventPrefix + ' ' + $btn.data('event-name'));
                    addHistoryEntry({
                        eventName: $btn.data('event-name'),
                        status: 'success',
                        message: response.data.message,
                        response: response.data.response || null,
                        time: new Date().toLocaleString()
                    });
                    renderNotice($result, 'success', response.data.message, response.data.response || null);
                } else {
                    addHistoryEntry({
                        eventName: $btn.data('event-name'),
                        status: 'error',
                        message: response.data.message,
                        response: response.data.response || null,
                        time: new Date().toLocaleString()
                    });
                    renderNotice($result, 'error', response.data.message, response.data.response || null);
                }
            }).fail(function() {
                addHistoryEntry({
                    eventName: $btn.data('event-name'),
                    status: 'error',
                    message: woosaasAdmin.messages.debugError,
                    response: null,
                    time: new Date().toLocaleString()
                });
                renderNotice($result, 'error', woosaasAdmin.messages.debugError);
            }).always(function() {
                $btn.prop('disabled', false).text(originalText);
            });
        });

        $(document).on('click', '#woosaas-clear-debug-history', function() {
            window.localStorage.removeItem(debugHistoryKey);
            renderHistory();
        });
    });
})(jQuery);