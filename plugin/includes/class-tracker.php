<?php
/**
 * Woosaas Tracker - JavaScript tracking
 */

class Woosaas_Tracker {
    
    public function __construct() {
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
    }
    
    public function enqueue_scripts() {
        $config = array(
            'api_url' => woosaas_get_api_url(),
            'api_key' => woosaas_get_api_key(),
            'cookie_domain' => wp_parse_url(home_url(), PHP_URL_HOST),
        );

        $product = self::get_product_context();
        if ($product !== null) {
            $config['product'] = $product;
        }

        wp_register_script(
            'woosaas-tracker',
            WOOSAAS_PLUGIN_URL . 'assets/js/tracker.js',
            array(),
            WOOSAAS_VERSION,
            true
        );

        wp_add_inline_script(
            'woosaas-tracker',
            self::get_bootstrap_script(),
            'before'
        );

        wp_localize_script('woosaas-tracker', 'woosaas_config', array(
            'api_url' => $config['api_url'],
            'api_key' => $config['api_key'],
            'cookie_domain' => $config['cookie_domain'],
            'product' => isset($config['product']) ? $config['product'] : null,
        ));

        wp_enqueue_script(
            'woosaas-tracker',
            WOOSAAS_PLUGIN_URL . 'assets/js/tracker.js',
            array(),
            WOOSAAS_VERSION,
            true
        );
    }

    public static function get_bootstrap_script() {
        return <<<'JS'
(function(w) {
    if (typeof w.woosaas === 'function' && Array.isArray(w.woosaas.q)) {
        return;
    }

    var queue = [];
    var woosaas = function() {
        queue.push(Array.prototype.slice.call(arguments));
    };

    woosaas.q = queue;
    w.woosaas = woosaas;
})(window);
JS;
    }

    public static function get_product_context() {
        if (!function_exists('is_product') || !is_product()) {
            return null;
        }

        if (!function_exists('get_the_ID') || !function_exists('wc_get_product')) {
            return null;
        }

        $product_id = get_the_ID();
        if (!$product_id) {
            return null;
        }

        $product = wc_get_product($product_id);
        if (!$product) {
            return null;
        }

        return array(
            'product_id' => (string) $product->get_id(),
            'product_name' => $product->get_name(),
        );
    }
}