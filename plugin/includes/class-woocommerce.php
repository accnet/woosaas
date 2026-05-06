<?php
/**
 * Woosaas WooCommerce Integration
 */

class Woosaas_WooCommerce {
    
    private $collector;
    
    public function __construct() {
        $this->collector = new Woosaas_Collector();
        
        // Add to cart tracking
        add_action('woocommerce_add_to_cart', array($this, 'track_add_to_cart'), 10, 6);
        
        // Checkout tracking
        add_action('woocommerce_before_checkout_form', array($this, 'track_checkout_start'));
        
        // Order complete tracking
        add_action('woocommerce_order_status_completed', array($this, 'track_order_complete'), 10, 1);
        
        // Also track on checkout order processed
        add_action('woocommerce_checkout_order_processed', array($this, 'track_order_processed'), 10, 3);
        
        // Remove from cart
        add_action('woocommerce_remove_cart_item', array($this, 'track_remove_from_cart'), 10, 2);
    }
    
    /**
     * Track add to cart
     */
    public function track_add_to_cart($cart_item_key, $product_id, $quantity, $variation_id, $variation, $cart_item_data) {
        $this->collector->track_add_to_cart($product_id, $quantity);
    }
    
    /**
     * Track checkout start
     */
    public function track_checkout_start() {
        $this->collector->track_checkout_start();
    }
    
    /**
     * Track order complete (payment success)
     */
    public function track_order_complete($order_id) {
        $this->collector->track_purchase($order_id);
    }
    
    /**
     * Track order processed (before payment)
     */
    public function track_order_processed($order_id, $posted_data, $order) {
        // Store attribution in order meta
        $attribution = $this->get_attribution();
        
        if ($attribution) {
            $order->update_meta_data('_woosaas_attribution', json_encode($attribution));
            $order->update_meta_data('_woosaas_client_id', $this->get_client_id());
            $order->update_meta_data('_woosaas_session_id', $this->get_session_id());
            $order->save();
        }
    }
    
    /**
     * Track remove from cart
     */
    public function track_remove_from_cart($cart_item_key, $cart) {
        // Optional: track cart abandonment signals
    }
    
    /**
     * Get attribution
     */
    private function get_attribution() {
        $cookie = isset($_COOKIE[WOOSAAS_COOKIE_ATTR]) ? $_COOKIE[WOOSAAS_COOKIE_ATTR] : '';
        
        if (empty($cookie)) {
            return null;
        }
        
        return json_decode(stripslashes($cookie), true);
    }
    
    /**
     * Get client ID
     */
    private function get_client_id() {
        return isset($_COOKIE[WOOSAAS_COOKIE_CLIENT]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_CLIENT]) : '';
    }
    
    /**
     * Get session ID
     */
    private function get_session_id() {
        return isset($_COOKIE[WOOSAAS_COOKIE_SESSION]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_SESSION]) : '';
    }
}