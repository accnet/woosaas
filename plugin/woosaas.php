<?php
/**
 * Plugin Name: Woosaas Analytics
 * Plugin URI: https://woosaas.com
 * Description: Analytics tracking for WooCommerce stores
 * Version: 1.0.0
 * Author: Woosaas
 * Author URI: https://woosaas.com
 * Text Domain: woosaas
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * WC requires at least: 8.0
 */

if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('WOOSAAS_VERSION', '1.0.0');
define('WOOSAAS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WOOSAAS_PLUGIN_URL', plugin_dir_url(__FILE__));

// Cookie constants
define('WOOSAAS_COOKIE_CLIENT', 'woosaas_client_id');
define('WOOSAAS_COOKIE_SESSION', 'woosaas_session_id');
define('WOOSAAS_COOKIE_ATTR', 'woosaas_attribution');

// Load composer autoloader if exists
if (file_exists(WOOSAAS_PLUGIN_DIR . 'vendor/autoload.php')) {
    require_once WOOSAAS_PLUGIN_DIR . 'vendor/autoload.php';
}

// Main plugin class
class Woosaas_Analytics {
    
    private static $instance = null;
    
    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        $this->load_dependencies();
        $this->init_hooks();
    }
    
    private function load_dependencies() {
        require_once WOOSAAS_PLUGIN_DIR . 'includes/class-woosaas.php';
        require_once WOOSAAS_PLUGIN_DIR . 'includes/class-tracker.php';
        require_once WOOSAAS_PLUGIN_DIR . 'includes/class-attribution.php';
        require_once WOOSAAS_PLUGIN_DIR . 'includes/class-collector.php';
        require_once WOOSAAS_PLUGIN_DIR . 'includes/class-woocommerce.php';
        require_once WOOSAAS_PLUGIN_DIR . 'includes/admin/class-admin.php';
        require_once WOOSAAS_PLUGIN_DIR . 'includes/utils/class-cookie.php';
        require_once WOOSAAS_PLUGIN_DIR . 'includes/utils/helpers.php';
    }
    
    private function init_hooks() {
        add_action('plugins_loaded', array($this, 'load_textdomain'));
        add_action('init', array($this, 'init'));
        
        // Initialize components
        add_action('wp_loaded', array($this, 'init_components'));
    }
    
    public function load_textdomain() {
        load_plugin_textdomain(
            'woosaas',
            false,
            dirname(plugin_basename(__FILE__)) . '/languages'
        );
    }
    
    public function init() {
        // Check if WooCommerce is active
        if (!class_exists('WooCommerce')) {
            add_action('admin_notices', array($this, 'woocommerce_missing_notice'));
            return;
        }
        
        // Check if API key is configured
        $api_key = get_option('woosaas_api_key');
        if (empty($api_key)) {
            return;
        }
    }
    
    public function init_components() {
        // Load tracker if enabled
        if (get_option('woosaas_tracking_enabled', 'yes') === 'yes') {
            new Woosaas_Tracker();
            new Woosaas_Attribution();
            new Woosaas_Collector();
            
            if (class_exists('WooCommerce')) {
                new Woosaas_WooCommerce();
            }
        }
        
        // Load admin
        if (is_admin()) {
            new Woosaas_Admin();
        }
    }
    
    public static function woocommerce_missing_notice() {
        $class = 'notice notice-error';
        $message = __('Woosaas Analytics requires WooCommerce to be installed and active.', 'woosaas');
        printf('<div class="%1$s"><p>%2$s</p></div>', esc_attr($class), esc_html($message));
    }
    
    public function get_api_url() {
        return get_option('woosaas_api_url', 'https://api.woosaas.com');
    }
    
    public function get_api_key() {
        return get_option('woosaas_api_key', '');
    }
}

// Initialize plugin
function woosaas_init() {
    return Woosaas_Analytics::instance();
}

// Hook to initialize plugin
add_action('plugins_loaded', 'woosaas_init', 0);