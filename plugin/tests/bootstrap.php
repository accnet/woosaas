<?php

$GLOBALS['woosaas_actions'] = array();
$GLOBALS['woosaas_options'] = array();
$GLOBALS['woosaas_test_last_json'] = null;
$GLOBALS['woosaas_test_remote_get'] = null;
$GLOBALS['woosaas_test_remote_post'] = null;
$GLOBALS['woosaas_test_is_product'] = false;
$GLOBALS['woosaas_test_current_post_id'] = 0;
$GLOBALS['woosaas_test_products'] = array();

if (!defined('WOOSAAS_VERSION')) {
    define('WOOSAAS_VERSION', '1.0.0-test');
}

if (!defined('WOOSAAS_COOKIE_CLIENT')) {
    define('WOOSAAS_COOKIE_CLIENT', 'woosaas_client_id');
}

if (!defined('WOOSAAS_COOKIE_SESSION')) {
    define('WOOSAAS_COOKIE_SESSION', 'woosaas_session_id');
}

if (!defined('WOOSAAS_COOKIE_ATTR')) {
    define('WOOSAAS_COOKIE_ATTR', 'woosaas_attribution');
}

if (!defined('WOOSAAS_PLUGIN_URL')) {
    define('WOOSAAS_PLUGIN_URL', 'https://example.test/wp-content/plugins/woosaas/');
}

if (!function_exists('__')) {
    function __($text) {
        return $text;
    }
}

if (!function_exists('add_action')) {
    function add_action($hook, $callback = null) {
        $GLOBALS['woosaas_actions'][$hook] = $callback;
        return null;
    }
}

if (!function_exists('add_menu_page')) {
    function add_menu_page() {
        return null;
    }
}

if (!function_exists('add_submenu_page')) {
    function add_submenu_page() {
        return null;
    }
}

if (!function_exists('register_setting')) {
    function register_setting() {
        return true;
    }
}

if (!function_exists('wp_enqueue_style')) {
    function wp_enqueue_style() {
        return true;
    }
}

if (!function_exists('wp_enqueue_script')) {
    function wp_enqueue_script() {
        return true;
    }
}

if (!function_exists('wp_register_script')) {
    function wp_register_script() {
        return true;
    }
}

if (!function_exists('wp_add_inline_script')) {
    function wp_add_inline_script() {
        return true;
    }
}

if (!function_exists('wp_localize_script')) {
    function wp_localize_script() {
        return true;
    }
}

if (!function_exists('admin_url')) {
    function admin_url($path = '') {
        return 'https://example.test/wp-admin/' . ltrim($path, '/');
    }
}

if (!function_exists('wp_create_nonce')) {
    function wp_create_nonce() {
        return 'nonce';
    }
}

if (!function_exists('check_ajax_referer')) {
    function check_ajax_referer() {
        return true;
    }
}

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($value) {
        return json_encode($value);
    }
}

if (!function_exists('wp_parse_url')) {
    function wp_parse_url($url, $component = -1) {
        return parse_url($url, $component);
    }
}

if (!function_exists('get_option')) {
    function get_option($name, $default = false) {
        return array_key_exists($name, $GLOBALS['woosaas_options']) ? $GLOBALS['woosaas_options'][$name] : $default;
    }
}

if (!function_exists('update_option')) {
    function update_option($name, $value) {
        $GLOBALS['woosaas_options'][$name] = $value;
        return true;
    }
}

if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($value) {
        return is_scalar($value) ? trim((string) $value) : '';
    }
}

if (!function_exists('wp_unslash')) {
    function wp_unslash($value) {
        return $value;
    }
}

if (!function_exists('esc_url_raw')) {
    function esc_url_raw($url) {
        return $url;
    }
}

if (!function_exists('trailingslashit')) {
    function trailingslashit($value) {
        return rtrim($value, '/') . '/';
    }
}

if (!class_exists('WP_Error')) {
    class WP_Error {
        private $message;

        public function __construct($code = '', $message = '') {
            $this->message = $message;
        }

        public function get_error_message() {
            return $this->message;
        }
    }
}

if (!function_exists('is_wp_error')) {
    function is_wp_error($thing) {
        return $thing instanceof WP_Error;
    }
}

if (!function_exists('wp_remote_get')) {
    function wp_remote_get() {
        return $GLOBALS['woosaas_test_remote_get'];
    }
}

if (!function_exists('wp_remote_post')) {
    function wp_remote_post($url = '', $args = array()) {
        if (is_callable($GLOBALS['woosaas_test_remote_post'])) {
            return call_user_func($GLOBALS['woosaas_test_remote_post'], $url, $args);
        }

        return $GLOBALS['woosaas_test_remote_post'];
    }
}

if (!function_exists('wp_remote_retrieve_body')) {
    function wp_remote_retrieve_body($response) {
        return isset($response['body']) ? $response['body'] : '';
    }
}

if (!function_exists('wp_remote_retrieve_response_code')) {
    function wp_remote_retrieve_response_code($response) {
        return isset($response['response']['code']) ? $response['response']['code'] : 0;
    }
}

if (!class_exists('Woosaas_Test_Json_Response')) {
    class Woosaas_Test_Json_Response extends Exception {
        public $payload;
        public $success;

        public function __construct($success, array $payload) {
            parent::__construct('JSON response');
            $this->success = $success;
            $this->payload = $payload;
        }
    }
}

if (!function_exists('wp_send_json_success')) {
    function wp_send_json_success($payload = array()) {
        $GLOBALS['woosaas_test_last_json'] = array('success' => true, 'data' => $payload);
        throw new Woosaas_Test_Json_Response(true, $payload);
    }
}

if (!function_exists('wp_send_json_error')) {
    function wp_send_json_error($payload = array()) {
        $GLOBALS['woosaas_test_last_json'] = array('success' => false, 'data' => $payload);
        throw new Woosaas_Test_Json_Response(false, $payload);
    }
}

if (!function_exists('wp_generate_uuid4')) {
    function wp_generate_uuid4() {
        return '123e4567-e89b-12d3-a456-426614174000';
    }
}

if (!function_exists('get_woocommerce_currency')) {
    function get_woocommerce_currency() {
        return 'USD';
    }
}

if (!function_exists('esc_textarea')) {
    function esc_textarea($value) {
        return $value;
    }
}

if (!function_exists('esc_html')) {
    function esc_html($value) {
        return $value;
    }
}

if (!function_exists('esc_attr')) {
    function esc_attr($value) {
        return $value;
    }
}

if (!function_exists('esc_attr_e')) {
    function esc_attr_e($text) {
        echo $text;
    }
}

if (!function_exists('esc_html_e')) {
    function esc_html_e($text) {
        echo $text;
    }
}

if (!function_exists('current_user_can')) {
    function current_user_can() {
        return true;
    }
}

if (!function_exists('submit_button')) {
    function submit_button() {
        return '';
    }
}

if (!function_exists('settings_fields')) {
    function settings_fields() {
        return '';
    }
}

if (!function_exists('checked')) {
    function checked($checked, $current = true) {
        return $checked === $current ? 'checked="checked"' : '';
    }
}

if (!function_exists('sprintf')) {
    function sprintf($format, ...$values) {
        return vsprintf($format, $values);
    }
}

if (!function_exists('home_url')) {
    function home_url() {
        return 'https://shop.example.test';
    }
}

if (!function_exists('woosaas_get_api_url')) {
    function woosaas_get_api_url() {
        return 'https://api.example.test';
    }
}

if (!function_exists('woosaas_get_api_key')) {
    function woosaas_get_api_key() {
        return 'wk_live_test';
    }
}

if (!function_exists('is_product')) {
    function is_product() {
        return (bool) $GLOBALS['woosaas_test_is_product'];
    }
}

if (!function_exists('get_the_ID')) {
    function get_the_ID() {
        return $GLOBALS['woosaas_test_current_post_id'];
    }
}

if (!function_exists('wc_get_product')) {
    function wc_get_product($product_id) {
        return isset($GLOBALS['woosaas_test_products'][$product_id]) ? $GLOBALS['woosaas_test_products'][$product_id] : null;
    }
}

if (!function_exists('untrailingslashit')) {
    function untrailingslashit($value) {
        return rtrim($value, '/');
    }
}

if (!function_exists('esc_url_raw')) {
    function esc_url_raw($url) {
        return $url;
    }
}

if (!function_exists('current_time')) {
    function current_time($type) {
        if ($type === 'timestamp') {
            return time();
        }

        return date('Y-m-d H:i:s');
    }
}

if (!function_exists('human_time_diff')) {
    function human_time_diff($from, $to) {
        $diff = max($to - $from, 0);
        if ($diff < 60) {
            return 'less than a minute';
        }
        if ($diff < 3600) {
            return (string) floor($diff / 60) . ' minutes';
        }
        if ($diff < 86400) {
            return (string) floor($diff / 3600) . ' hours';
        }

        return (string) floor($diff / 86400) . ' days';
    }
}

require_once __DIR__ . '/../includes/class-tracker.php';
require_once __DIR__ . '/../includes/class-collector.php';
require_once __DIR__ . '/../includes/admin/class-admin.php';