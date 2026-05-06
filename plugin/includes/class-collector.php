<?php
/**
 * Woosaas Collector - Send events to API
 */

class Woosaas_Collector {
    
    private $api_url;
    private $api_key;
    private $event_queue = array();
    
    public function __construct() {
        $this->api_url = woosaas_get_api_url();
        $this->api_key = woosaas_get_api_key();
        
        // Hook into WordPress shutdown to ensure events are sent
        add_action('shutdown', array($this, 'flush_queue'));
    }
    
    /**
     * Track an event
     */
    public function track($event_name, $properties = array()) {
        $event = $this->build_event($event_name, $properties);
        $this->event_queue[] = $event;
        
        // Send immediately for critical events
        if (in_array($event_name, array('purchase', 'checkout_start'))) {
            $this->send_event($event);
        }
    }
    
    /**
     * Track add to cart
     */
    public function track_add_to_cart($product_id, $quantity = 1) {
        $product = wc_get_product($product_id);
        
        if (!$product) {
            return;
        }
        
        $this->track('add_to_cart', array(
            'product_id' => $product_id,
            'product_name' => $product->get_name(),
            'quantity' => $quantity,
            'revenue' => $product->get_price() * $quantity,
            'currency' => get_woocommerce_currency()
        ));
    }
    
    /**
     * Track checkout start
     */
    public function track_checkout_start() {
        $this->track('checkout_start', array(
            'url' => wc_get_checkout_url()
        ));
    }
    
    /**
     * Track purchase (order complete)
     */
    public function track_purchase($order_id) {
        $order = wc_get_order($order_id);
        
        if (!$order) {
            return;
        }
        
        $attribution = $this->get_attribution();
        
        $items = array();
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $items[] = array(
                'product_id' => $item->get_product_id(),
                'product_name' => $item->get_name(),
                'quantity' => $item->get_quantity(),
                'price' => $item->get_total() / $item->get_quantity()
            );
        }
        
        $this->track('purchase', array(
            'order_id' => $order_id,
            'revenue' => $order->get_total(),
            'currency' => $order->get_currency(),
            'items' => $items,
            'attribution' => $attribution
        ));
    }
    
    /**
     * Build event object
     */
    private function build_event($event_name, $properties = array()) {
        $client_id = isset($_COOKIE[WOOSAAS_COOKIE_CLIENT]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_CLIENT]) : '';
        $session_id = isset($_COOKIE[WOOSAAS_COOKIE_SESSION]) ? sanitize_text_field($_COOKIE[WOOSAAS_COOKIE_SESSION]) : '';
        $attribution = $this->get_attribution();
        $request_uri = isset($_SERVER['REQUEST_URI']) ? sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])) : '/';
        $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';
        $referrer = isset($_SERVER['HTTP_REFERER']) ? esc_url_raw(wp_unslash($_SERVER['HTTP_REFERER'])) : '';

        $event = array(
            'event_id' => $this->generate_uuid(),
            'event_time' => current_time('c'),
            'event_name' => $event_name,
            'client_id' => $client_id,
            'session_id' => $session_id,
            'url' => home_url($request_uri),
            'path' => parse_url($request_uri, PHP_URL_PATH),
            'referrer' => $referrer,
            'user_agent' => $user_agent,
            'attribution' => $attribution,
            'properties' => $properties,
        );

        $mapped_fields = array('order_id', 'product_id', 'product_name', 'quantity', 'revenue', 'currency');

        foreach ($mapped_fields as $field) {
            if (array_key_exists($field, $properties)) {
                $event[$field] = $properties[$field];
                unset($event['properties'][$field]);
            }
        }

        if (isset($properties['items']) && is_array($properties['items'])) {
            $event['items_json'] = wp_json_encode($properties['items']);
            unset($event['properties']['items']);
        }

        return $event;
    }
    
    /**
     * Get attribution from cookie
     */
    private function get_attribution() {
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
     * Send event to API
     */
    private function send_event($event) {
        if (empty($this->api_key)) {
            return;
        }
        
        $payload = json_encode($event);
        
        $args = array(
            'method' => 'POST',
            'body' => $payload,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-Api-Key' => $this->api_key
            ),
            'timeout' => 5,
            'blocking' => false
        );
        
        wp_remote_post($this->api_url . '/api/v1/collect', $args);
    }
    
    /**
     * Flush event queue on shutdown
     */
    public function flush_queue() {
        if (empty($this->event_queue) || empty($this->api_key)) {
            return;
        }
        
        $payload = json_encode(array('events' => $this->event_queue));
        
        $args = array(
            'method' => 'POST',
            'body' => $payload,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-Api-Key' => $this->api_key
            ),
            'timeout' => 10,
            'blocking' => false
        );
        
        wp_remote_post($this->api_url . '/api/v1/collect/batch', $args);
    }
    
    /**
     * Generate UUID
     */
    private function generate_uuid() {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
