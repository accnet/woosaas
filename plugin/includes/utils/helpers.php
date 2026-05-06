<?php
/**
 * Woosaas Helper Functions
 */

// Get API URL
function woosaas_get_api_url() {
    return get_option('woosaas_api_url', 'https://api.woosaas.com');
}

// Get API Key
function woosaas_get_api_key() {
    return get_option('woosaas_api_key', '');
}

// Check if tracking is enabled
function woosaas_is_tracking_enabled() {
    return get_option('woosaas_tracking_enabled', 'yes') === 'yes';
}

// Check if should track logged in users
function woosaas_track_logged_in() {
    return get_option('woosaas_track_logged_in', 'no') === 'yes';
}

// Get client ID
function woosaas_get_client_id() {
    return isset($_COOKIE[WOOSAAS_COOKIE_CLIENT]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_CLIENT]) : '';
}

// Get session ID
function woosaas_get_session_id() {
    return isset($_COOKIE[WOOSAAS_COOKIE_SESSION]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_SESSION]) : '';
}

// Get attribution
function woosaas_get_attribution() {
    $cookie = isset($_COOKIE[WOOSAAS_COOKIE_ATTR]) ? $_COOKIE[WOOSAAS_COOKIE_ATTR] : '';
    
    if (empty($cookie)) {
        return null;
    }
    
    return json_decode(stripslashes($cookie), true);
}

// Get order attribution
function woosaas_get_order_attribution($order_id) {
    $order = wc_get_order($order_id);
    
    if (!$order) {
        return null;
    }
    
    $attr_json = $order->get_meta('_woosaas_attribution');
    
    if (empty($attr_json)) {
        return null;
    }
    
    return json_decode($attr_json, true);
}