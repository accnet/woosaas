<?php
/**
 * Woosaas Attribution - Server-side attribution handling
 */

class Woosaas_Attribution {
    
    public function __construct() {
        // Attribution is primarily handled in JS, but we can enhance on server
        add_filter('woocommerce_checkout_order_processed', array($this, 'preserve_attribution_on_checkout'), 10, 3);
    }
    
    /**
     * Get current attribution data
     */
    public function get_attribution() {
        $cookie = isset($_COOKIE[WOOSAAS_COOKIE_ATTR]) ? $_COOKIE[WOOSAAS_COOKIE_ATTR] : '';
        
        if (empty($cookie)) {
            return null;
        }
        
        $data = json_decode(stripslashes($cookie), true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }
        
        return $data;
    }
    
    /**
     * Check if current visit is direct
     */
    public function is_direct() {
        $attr = $this->get_attribution();
        
        if (!$attr) {
            return true;
        }
        
        // If last touch was direct and there's no new attribution, it's direct
        if (isset($attr['source']) && $attr['source'] === 'direct') {
            return true;
        }
        
        return false;
    }
    
    /**
     * Get UTM source
     */
    public function get_source() {
        $attr = $this->get_attribution();
        return isset($attr['source']) ? $attr['source'] : 'direct';
    }
    
    /**
     * Get UTM medium
     */
    public function get_medium() {
        $attr = $this->get_attribution();
        return isset($attr['medium']) ? $attr['medium'] : '';
    }
    
    /**
     * Get UTM campaign
     */
    public function get_campaign() {
        $attr = $this->get_attribution();
        return isset($attr['campaign']) ? $attr['campaign'] : '';
    }
    
    /**
     * Preserve attribution on checkout
     */
    public function preserve_attribution_on_checkout($order_id, $posted_data, $order) {
        $attr = $this->get_attribution();
        
        if ($attr) {
            // Store attribution in order meta
            $order->update_meta_data('_woosaas_attribution', json_encode($attr));
            $order->update_meta_data('_woosaas_client_id', $this->get_client_id());
            $order->update_meta_data('_woosaas_session_id', $this->get_session_id());
            $order->save();
        }
    }
    
    /**
     * Get client ID
     */
    public function get_client_id() {
        return isset($_COOKIE[WOOSAAS_COOKIE_CLIENT]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_CLIENT]) : '';
    }
    
    /**
     * Get session ID
     */
    public function get_session_id() {
        return isset($_COOKIE[WOOSAAS_COOKIE_SESSION]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_SESSION]) : '';
    }
    
    /**
     * Get attribution for an order
     */
    public function get_order_attribution($order_id) {
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
}