<?php
/**
 * Woosaas Admin Settings Page
 */

if (!defined('ABSPATH')) {
    exit;
}

class Woosaas_Admin {
    
    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }
    
    public function add_admin_menu() {
        add_menu_page(
            __('Woosaas Analytics', 'woosaas'),
            __('Woosaas', 'woosaas'),
            'manage_options',
            'woosaas',
            array($this, 'render_settings_page'),
            'dashicons-chart-bar',
            80
        );

        add_submenu_page(
            'woosaas',
            __('Setup Wizard', 'woosaas'),
            __('Setup Wizard', 'woosaas'),
            'manage_options',
            'woosaas',
            array($this, 'render_settings_page')
        );

        add_submenu_page(
            'woosaas',
            __('Events Debug', 'woosaas'),
            __('Events Debug', 'woosaas'),
            'manage_options',
            'woosaas-debug',
            array($this, 'render_debug_page')
        );
    }
    
    public function register_settings() {
        register_setting('woosaas_settings', 'woosaas_api_url', array(
            'type' => 'string',
            'default' => 'https://api.woosaas.com'
        ));

        register_setting('woosaas_settings', 'woosaas_api_key', array(
            'type' => 'string',
            'default' => ''
        ));

        register_setting('woosaas_settings', 'woosaas_tracking_enabled', array(
            'type' => 'string',
            'default' => 'yes'
        ));

        register_setting('woosaas_settings', 'woosaas_track_logged_in', array(
            'type' => 'string',
            'default' => 'no'
        ));
    }
    
    public function enqueue_admin_assets($hook) {
        if (!in_array($hook, array('toplevel_page_woosaas', 'woosaas_page_woosaas-debug'), true)) {
            return;
        }
        
        wp_enqueue_style(
            'woosaas-admin',
            WOOSAAS_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            WOOSAAS_VERSION
        );

        wp_enqueue_script(
            'woosaas-admin',
            WOOSAAS_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery'),
            WOOSAAS_VERSION,
            true
        );

        wp_localize_script('woosaas-admin', 'woosaasAdmin', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'verifyNonce' => wp_create_nonce('woosaas_verify_api'),
            'debugNonce' => wp_create_nonce('woosaas_debug_event'),
            'messages' => array(
                'verifying' => __('Verifying...', 'woosaas'),
                'verifyDefault' => __('Verify API Key', 'woosaas'),
                'verifyError' => __('Connection failed. Please check your API URL and API key.', 'woosaas'),
                'sending' => __('Sending test event...', 'woosaas'),
                'debugDefault' => __('Send Test Event', 'woosaas'),
                'debugError' => __('Failed to send the debug event.', 'woosaas'),
                'justNow' => __('Just now', 'woosaas'),
                'verifiedSitePrefix' => __('Verified site ID:', 'woosaas'),
                'latestEventPrefix' => __('Latest event:', 'woosaas'),
            ),
        ));
    }
    
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $api_url = get_option('woosaas_api_url', 'https://api.woosaas.com');
        $api_key = get_option('woosaas_api_key', '');
        $tracking_enabled = get_option('woosaas_tracking_enabled', 'yes');
        $track_logged_in = get_option('woosaas_track_logged_in', 'no');
        $verified_site_id = get_option('woosaas_verified_site_id', '');
        $last_verified_at = get_option('woosaas_last_verified_at', '');
        $last_debug_event_at = get_option('woosaas_last_debug_event_at', '');
        $last_debug_event_name = get_option('woosaas_last_debug_event_name', '');
        $has_api_key = !empty($api_key);
        $is_ready = $has_api_key && 'yes' === $tracking_enabled;
        $tracking_code = self::build_tracking_code($api_url, $api_key);
        ?>
        <div class="wrap woosaas-admin">
            <div class="woosaas-shell">
                <section class="woosaas-hero">
                    <div>
                        <span class="woosaas-kicker"><?php esc_html_e('WooCommerce Analytics', 'woosaas'); ?></span>
                        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
                        <p><?php esc_html_e('Connect your store, verify the API key, and control what data is sent to Woosaas without leaving WordPress.', 'woosaas'); ?></p>
                    </div>
                    <div class="woosaas-hero__meta">
                        <div class="woosaas-badge <?php echo $is_ready ? 'is-success' : 'is-muted'; ?>">
                            <?php echo esc_html($is_ready ? __('Ready to collect data', 'woosaas') : __('Setup required', 'woosaas')); ?>
                        </div>
                        <div class="woosaas-meta-card">
                            <span><?php esc_html_e('Plugin version', 'woosaas'); ?></span>
                            <strong><?php echo esc_html(WOOSAAS_VERSION); ?></strong>
                        </div>
                    </div>
                </section>

                <section class="woosaas-status-grid">
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Connection', 'woosaas'); ?></span>
                        <strong><?php echo esc_html($has_api_key ? __('API key added', 'woosaas') : __('API key missing', 'woosaas')); ?></strong>
                        <p><?php echo esc_html($has_api_key ? $this->mask_api_key($api_key) : __('Paste the API key from your dashboard to start verification.', 'woosaas')); ?></p>
                    </article>
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Tracking', 'woosaas'); ?></span>
                        <strong><?php echo esc_html('yes' === $tracking_enabled ? __('Enabled', 'woosaas') : __('Paused', 'woosaas')); ?></strong>
                        <p><?php echo esc_html('yes' === $tracking_enabled ? __('Browser and WooCommerce events can be sent to the API.', 'woosaas') : __('No client or server events will be sent until tracking is re-enabled.', 'woosaas')); ?></p>
                    </article>
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Admin visits', 'woosaas'); ?></span>
                        <strong><?php echo esc_html('yes' === $track_logged_in ? __('Included', 'woosaas') : __('Excluded', 'woosaas')); ?></strong>
                        <p><?php echo esc_html('yes' === $track_logged_in ? __('Logged-in traffic will appear in reports.', 'woosaas') : __('Logged-in visits are ignored to reduce noisy internal traffic.', 'woosaas')); ?></p>
                    </article>
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Last verified', 'woosaas'); ?></span>
                        <strong id="woosaas-last-verified-at"><?php echo esc_html($last_verified_at ? $last_verified_at : __('Not verified yet', 'woosaas')); ?></strong>
                        <span class="woosaas-time-badge <?php echo esc_attr($last_verified_at ? self::get_time_badge_variant($last_verified_at) : 'is-stale'); ?>" id="woosaas-last-verified-badge"<?php echo $last_verified_at ? '' : ' hidden'; ?>><?php echo esc_html($last_verified_at ? self::format_relative_time($last_verified_at) : ''); ?></span>
                        <p id="woosaas-last-verified-site"><?php echo esc_html($verified_site_id ? sprintf(__('Verified site ID: %s', 'woosaas'), $verified_site_id) : __('Run API verification to save the linked site ID.', 'woosaas')); ?></p>
                    </article>
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Last debug event', 'woosaas'); ?></span>
                        <strong id="woosaas-last-debug-at"><?php echo esc_html($last_debug_event_at ? $last_debug_event_at : __('No debug event sent', 'woosaas')); ?></strong>
                        <span class="woosaas-time-badge <?php echo esc_attr($last_debug_event_at ? self::get_time_badge_variant($last_debug_event_at) : 'is-stale'); ?>" id="woosaas-last-debug-badge"<?php echo $last_debug_event_at ? '' : ' hidden'; ?>><?php echo esc_html($last_debug_event_at ? self::format_relative_time($last_debug_event_at) : ''); ?></span>
                        <p id="woosaas-last-debug-name"><?php echo esc_html($last_debug_event_name ? sprintf(__('Latest event: %s', 'woosaas'), $last_debug_event_name) : __('Use Events Debug to send a controlled event into the ingestion pipeline.', 'woosaas')); ?></p>
                    </article>
                </section>

                <div class="woosaas-wizard" data-woosaas-wizard>
                    <nav class="woosaas-wizard__nav" aria-label="<?php esc_attr_e('Setup steps', 'woosaas'); ?>">
                        <button type="button" class="woosaas-wizard__tab is-active" data-step-target="1">
                            <span><?php esc_html_e('Step 1', 'woosaas'); ?></span>
                            <strong><?php esc_html_e('Connect store', 'woosaas'); ?></strong>
                        </button>
                        <button type="button" class="woosaas-wizard__tab" data-step-target="2">
                            <span><?php esc_html_e('Step 2', 'woosaas'); ?></span>
                            <strong><?php esc_html_e('Verify API', 'woosaas'); ?></strong>
                        </button>
                        <button type="button" class="woosaas-wizard__tab" data-step-target="3">
                            <span><?php esc_html_e('Step 3', 'woosaas'); ?></span>
                            <strong><?php esc_html_e('Launch tracking', 'woosaas'); ?></strong>
                        </button>
                    </nav>

                    <section class="woosaas-panel woosaas-wizard__panel is-active" data-step-panel="1">
                        <div class="woosaas-panel__header">
                            <div>
                                <h2><?php esc_html_e('Connect your store', 'woosaas'); ?></h2>
                                <p><?php esc_html_e('Add the same API endpoint and site key that exists in your Woosaas dashboard.', 'woosaas'); ?></p>
                            </div>
                            <span class="woosaas-step"><?php esc_html_e('Step 1', 'woosaas'); ?></span>
                        </div>

                        <form action="options.php" method="post" class="woosaas-form">
                            <?php settings_fields('woosaas_settings'); ?>

                            <div class="woosaas-field">
                                <label for="woosaas_api_url"><?php esc_html_e('API URL', 'woosaas'); ?></label>
                                <input type="url" id="woosaas_api_url" name="woosaas_api_url" value="<?php echo esc_attr($api_url); ?>" class="regular-text" placeholder="https://api.woosaas.com" />
                                <p><?php esc_html_e('Base URL of your Woosaas backend. Keep the default for production.', 'woosaas'); ?></p>
                            </div>

                            <div class="woosaas-field">
                                <label for="woosaas_api_key"><?php esc_html_e('API Key', 'woosaas'); ?></label>
                                <input type="password" id="woosaas_api_key" name="woosaas_api_key" value="<?php echo esc_attr($api_key); ?>" class="regular-text" placeholder="wk_live_..." />
                                <p><?php esc_html_e('Copy this from Dashboard > Sites > API Keys.', 'woosaas'); ?></p>
                            </div>

                            <div class="woosaas-toggle-grid">
                                <label class="woosaas-toggle-card" for="woosaas_tracking_enabled">
                                    <input type="checkbox" id="woosaas_tracking_enabled" name="woosaas_tracking_enabled" value="yes" <?php checked($tracking_enabled, 'yes'); ?> />
                                    <span>
                                        <strong><?php esc_html_e('Enable tracking', 'woosaas'); ?></strong>
                                        <small><?php esc_html_e('Allow pageview and ecommerce events to be collected.', 'woosaas'); ?></small>
                                    </span>
                                </label>

                                <label class="woosaas-toggle-card" for="woosaas_track_logged_in">
                                    <input type="checkbox" id="woosaas_track_logged_in" name="woosaas_track_logged_in" value="yes" <?php checked($track_logged_in, 'yes'); ?> />
                                    <span>
                                        <strong><?php esc_html_e('Track logged-in users', 'woosaas'); ?></strong>
                                        <small><?php esc_html_e('Useful for staging or store operator behavior checks.', 'woosaas'); ?></small>
                                    </span>
                                </label>
                            </div>

                            <div class="woosaas-actions">
                                <?php submit_button(__('Save Settings', 'woosaas'), 'primary', 'submit', false); ?>
                                <button type="button" class="button button-secondary" data-step-target="2"><?php esc_html_e('Continue to verification', 'woosaas'); ?></button>
                            </div>
                        </form>
                    </section>

                    <section class="woosaas-panel woosaas-wizard__panel" data-step-panel="2" hidden>
                        <div class="woosaas-panel__header">
                            <div>
                                <h2><?php esc_html_e('Verify API access', 'woosaas'); ?></h2>
                                <p><?php esc_html_e('Use the current API URL and key values from the form to validate the site binding.', 'woosaas'); ?></p>
                            </div>
                            <span class="woosaas-step"><?php esc_html_e('Step 2', 'woosaas'); ?></span>
                        </div>

                        <div class="woosaas-stack">
                            <button type="button" class="button button-secondary woosaas-verify-button" id="woosaas-verify-btn">
                                <?php esc_html_e('Verify API Key', 'woosaas'); ?>
                            </button>
                            <div id="woosaas-verify-result" class="woosaas-verify-result"></div>
                            <div class="woosaas-actions">
                                <button type="button" class="button" data-step-target="1"><?php esc_html_e('Back to settings', 'woosaas'); ?></button>
                                <button type="button" class="button button-primary" data-step-target="3"><?php esc_html_e('Continue to launch checklist', 'woosaas'); ?></button>
                            </div>
                        </div>
                    </section>

                    <section class="woosaas-panel woosaas-wizard__panel" data-step-panel="3" hidden>
                        <div class="woosaas-panel__header">
                            <div>
                                <h2><?php esc_html_e('Launch tracking', 'woosaas'); ?></h2>
                                <p><?php esc_html_e('Use this final checklist to confirm the plugin is ready on the storefront.', 'woosaas'); ?></p>
                            </div>
                            <span class="woosaas-step"><?php esc_html_e('Step 3', 'woosaas'); ?></span>
                        </div>
                        <ol class="woosaas-checklist">
                            <li><?php esc_html_e('Create a site in the Woosaas dashboard.', 'woosaas'); ?></li>
                            <li><?php esc_html_e('Generate an API key for that site.', 'woosaas'); ?></li>
                            <li><?php esc_html_e('Paste the key here and save settings.', 'woosaas'); ?></li>
                            <li><?php esc_html_e('Run verification until the site ID is returned.', 'woosaas'); ?></li>
                            <li><?php esc_html_e('Browse the storefront and confirm events appear in the dashboard.', 'woosaas'); ?></li>
                            <li><?php esc_html_e('Open Events Debug to send controlled test events from WordPress admin.', 'woosaas'); ?></li>
                        </ol>
                        <div class="woosaas-copy-grid">
                            <div class="woosaas-field">
                                <label for="woosaas_verified_site_id"><?php esc_html_e('Verified site ID', 'woosaas'); ?></label>
                                <div class="woosaas-copy-row">
                                    <input type="text" id="woosaas_verified_site_id" value="<?php echo esc_attr($verified_site_id); ?>" readonly placeholder="<?php esc_attr_e('Run verification to fetch site ID', 'woosaas'); ?>" />
                                    <button type="button" class="button button-secondary" data-copy-target="#woosaas_verified_site_id"><?php esc_html_e('Copy Site ID', 'woosaas'); ?></button>
                                </div>
                            </div>
                            <div class="woosaas-field">
                                <label for="woosaas_tracking_code"><?php esc_html_e('Tracking code reference', 'woosaas'); ?></label>
                                <textarea id="woosaas_tracking_code" rows="7" readonly><?php echo esc_textarea($tracking_code); ?></textarea>
                                <div class="woosaas-actions">
                                    <button type="button" class="button button-secondary" data-copy-target="#woosaas_tracking_code"><?php esc_html_e('Copy Tracking Code', 'woosaas'); ?></button>
                                    <span class="woosaas-inline-note"><?php esc_html_e('The plugin injects tracking automatically. This snippet is for onboarding reference and diagnostics.', 'woosaas'); ?></span>
                                </div>
                            </div>
                        </div>
                        <div class="woosaas-actions">
                            <button type="button" class="button" data-step-target="2"><?php esc_html_e('Back to verification', 'woosaas'); ?></button>
                            <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=woosaas-debug')); ?>"><?php esc_html_e('Open Events Debug', 'woosaas'); ?></a>
                        </div>
                    </section>
                </div>
            </div>
        </div>
        <?php
    }

    public function render_debug_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $api_url = get_option('woosaas_api_url', 'https://api.woosaas.com');
        $api_key = get_option('woosaas_api_key', '');
        $tracking_enabled = get_option('woosaas_tracking_enabled', 'yes');
        $last_debug_event_at = get_option('woosaas_last_debug_event_at', '');
        $last_debug_event_name = get_option('woosaas_last_debug_event_name', '');
        ?>
        <div class="wrap woosaas-admin">
            <div class="woosaas-shell">
                <section class="woosaas-hero woosaas-hero--compact">
                    <div>
                        <span class="woosaas-kicker"><?php esc_html_e('Diagnostics', 'woosaas'); ?></span>
                        <h1><?php esc_html_e('Events Debug', 'woosaas'); ?></h1>
                        <p><?php esc_html_e('Send controlled test events to the collect endpoint and inspect the current plugin readiness from wp-admin.', 'woosaas'); ?></p>
                    </div>
                    <div class="woosaas-hero__meta">
                        <div class="woosaas-meta-card">
                            <span><?php esc_html_e('API key', 'woosaas'); ?></span>
                            <strong><?php echo esc_html($api_key ? $this->mask_api_key($api_key) : __('Missing', 'woosaas')); ?></strong>
                        </div>
                    </div>
                </section>

                <section class="woosaas-status-grid">
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('API URL', 'woosaas'); ?></span>
                        <strong><?php echo esc_html($api_url); ?></strong>
                        <p><?php esc_html_e('This endpoint receives both storefront and debug test events.', 'woosaas'); ?></p>
                    </article>
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Tracking switch', 'woosaas'); ?></span>
                        <strong><?php echo esc_html('yes' === $tracking_enabled ? __('Enabled', 'woosaas') : __('Disabled', 'woosaas')); ?></strong>
                        <p><?php esc_html_e('The debug sender does not depend on storefront script execution, only on valid API credentials.', 'woosaas'); ?></p>
                    </article>
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Use case', 'woosaas'); ?></span>
                        <strong><?php esc_html_e('Verify ingestion', 'woosaas'); ?></strong>
                        <p><?php esc_html_e('Useful when you need to confirm the API, Redis stream, and worker pipeline before storefront testing.', 'woosaas'); ?></p>
                    </article>
                    <article class="woosaas-status-card">
                        <span class="woosaas-status-card__label"><?php esc_html_e('Last debug event', 'woosaas'); ?></span>
                        <strong id="woosaas-debug-page-last-at"><?php echo esc_html($last_debug_event_at ? $last_debug_event_at : __('Not sent yet', 'woosaas')); ?></strong>
                        <span class="woosaas-time-badge <?php echo esc_attr($last_debug_event_at ? self::get_time_badge_variant($last_debug_event_at) : 'is-stale'); ?>" id="woosaas-debug-page-last-badge"<?php echo $last_debug_event_at ? '' : ' hidden'; ?>><?php echo esc_html($last_debug_event_at ? self::format_relative_time($last_debug_event_at) : ''); ?></span>
                        <p id="woosaas-debug-page-last-name"><?php echo esc_html($last_debug_event_name ? sprintf(__('Latest event: %s', 'woosaas'), $last_debug_event_name) : __('Send a test event below to stamp the current admin diagnostics run.', 'woosaas')); ?></p>
                    </article>
                </section>

                <div class="woosaas-layout">
                    <section class="woosaas-panel">
                        <div class="woosaas-panel__header">
                            <div>
                                <h2><?php esc_html_e('Send test events', 'woosaas'); ?></h2>
                                <p><?php esc_html_e('Each button posts a synthetic event with source=admin_debug to the collect endpoint.', 'woosaas'); ?></p>
                            </div>
                        </div>
                        <div class="woosaas-debug-grid">
                            <button type="button" class="button button-secondary woosaas-debug-button" data-event-name="pageview"><?php esc_html_e('Test Pageview', 'woosaas'); ?></button>
                            <button type="button" class="button button-secondary woosaas-debug-button" data-event-name="product_view"><?php esc_html_e('Test Product View', 'woosaas'); ?></button>
                            <button type="button" class="button button-secondary woosaas-debug-button" data-event-name="add_to_cart"><?php esc_html_e('Test Add To Cart', 'woosaas'); ?></button>
                            <button type="button" class="button button-secondary woosaas-debug-button" data-event-name="checkout_start"><?php esc_html_e('Test Checkout Start', 'woosaas'); ?></button>
                            <button type="button" class="button button-secondary woosaas-debug-button" data-event-name="purchase"><?php esc_html_e('Test Purchase', 'woosaas'); ?></button>
                        </div>
                        <div id="woosaas-debug-result" class="woosaas-verify-result"></div>
                    </section>

                    <aside class="woosaas-sidebar">
                        <section class="woosaas-panel">
                            <div class="woosaas-panel__header">
                                <div>
                                    <h2><?php esc_html_e('Event payload notes', 'woosaas'); ?></h2>
                                    <p><?php esc_html_e('The debug sender uses valid required fields and appends source markers for filtering.', 'woosaas'); ?></p>
                                </div>
                            </div>
                            <ul class="woosaas-facts">
                                <li><?php esc_html_e('All events are tagged with properties.source = admin_debug.', 'woosaas'); ?></li>
                                <li><?php esc_html_e('Product view and checkout start are available to validate funnel queries end-to-end.', 'woosaas'); ?></li>
                                <li><?php esc_html_e('Purchase includes a synthetic order ID and revenue.', 'woosaas'); ?></li>
                                <li><?php esc_html_e('Add to cart includes product_id, quantity, currency, and revenue.', 'woosaas'); ?></li>
                            </ul>
                        </section>
                    </aside>
                </div>

                <section class="woosaas-panel woosaas-panel--history">
                    <div class="woosaas-panel__header">
                        <div>
                            <h2><?php esc_html_e('Recent debug responses', 'woosaas'); ?></h2>
                            <p><?php esc_html_e('Local history of the latest debug requests from this browser. Useful while validating ingestion.', 'woosaas'); ?></p>
                        </div>
                        <button type="button" class="button button-secondary" id="woosaas-clear-debug-history"><?php esc_html_e('Clear history', 'woosaas'); ?></button>
                    </div>
                    <div id="woosaas-debug-history" class="woosaas-history"></div>
                </section>
            </div>
        </div>
        <?php
    }

    private function mask_api_key($api_key) {
        if (strlen($api_key) <= 8) {
            return $api_key;
        }

        return substr($api_key, 0, 4) . str_repeat('•', max(strlen($api_key) - 8, 4)) . substr($api_key, -4);
    }

    public static function format_relative_time($datetime) {
        $timestamp = strtotime($datetime);
        if (!$timestamp) {
            return __('Unknown', 'woosaas');
        }

        if (function_exists('current_time') && function_exists('human_time_diff')) {
            $now = (int) current_time('timestamp');
            return sprintf(__('%s ago', 'woosaas'), human_time_diff($timestamp, $now));
        }

        $diff = max(time() - $timestamp, 0);
        if ($diff < 60) {
            return __('Just now', 'woosaas');
        }
        if ($diff < 3600) {
            return sprintf(__('%d minutes ago', 'woosaas'), (int) floor($diff / 60));
        }
        if ($diff < 86400) {
            return sprintf(__('%d hours ago', 'woosaas'), (int) floor($diff / 3600));
        }

        return sprintf(__('%d days ago', 'woosaas'), (int) floor($diff / 86400));
    }

    public static function get_time_badge_variant($datetime) {
        $timestamp = strtotime($datetime);
        if (!$timestamp) {
            return 'is-stale';
        }

        $age = max(time() - $timestamp, 0);
        if ($age < 900) {
            return 'is-fresh';
        }
        if ($age < 86400) {
            return 'is-warm';
        }

        return 'is-stale';
    }

    public static function build_tracking_code($api_url, $api_key) {
        $config = wp_json_encode(array(
            'api_url' => untrailingslashit($api_url),
            'api_key' => $api_key,
            'cookie_domain' => wp_parse_url(home_url(), PHP_URL_HOST),
        ));

        $bootstrap = class_exists('Woosaas_Tracker') ? Woosaas_Tracker::get_bootstrap_script() : '';

        return "<script>" . $bootstrap . "</script>\n"
            . "<script>window.woosaas_config = " . $config . ";</script>\n"
            . '<script async src="' . esc_url_raw(WOOSAAS_PLUGIN_URL . 'assets/js/tracker.js') . '"></script>';
    }

    public static function send_debug_event($event_name, $api_url, $api_key) {
        $currency = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';

        $event = array(
            'event_id' => wp_generate_uuid4(),
            'event_time' => current_time('c'),
            'event_name' => $event_name,
            'client_id' => wp_generate_uuid4(),
            'session_id' => wp_generate_uuid4(),
            'url' => admin_url('admin.php?page=woosaas-debug'),
            'path' => '/wp-admin/admin.php?page=woosaas-debug',
            'user_agent' => isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '',
            'properties' => array(
                'source' => 'admin_debug',
                'debug_origin' => 'wp_admin',
            ),
        );

        if (in_array($event_name, array('product_view', 'add_to_cart', 'checkout_start', 'purchase'), true)) {
            $event['product_id'] = 'debug-product-1';
            $event['product_name'] = 'Debug Product';
        }

        if (in_array($event_name, array('add_to_cart', 'purchase'), true)) {
            $event['quantity'] = 1;
            $event['revenue'] = 29.99;
            $event['currency'] = $currency;
        }

        if ('purchase' === $event_name) {
            $event['order_id'] = 'debug-order-' . gmdate('YmdHis');
        }

        return wp_remote_post(
            trailingslashit($api_url) . 'api/v1/collect',
            array(
                'headers' => array(
                    'Content-Type' => 'application/json',
                    'X-Api-Key' => $api_key,
                ),
                'body' => wp_json_encode($event),
                'timeout' => 10,
            )
        );
    }
    
}

// AJAX handler for verify
add_action('wp_ajax_woosaas_verify_api', function() {
    check_ajax_referer('woosaas_verify_api', 'nonce');

    $api_url = isset($_POST['api_url']) ? esc_url_raw(wp_unslash($_POST['api_url'])) : '';
    $api_key = isset($_POST['api_key']) ? sanitize_text_field(wp_unslash($_POST['api_key'])) : '';
    
    if (empty($api_key)) {
        wp_send_json_error(array('message' => 'API key is required'));
        return;
    }
    
    $response = wp_remote_get($api_url . '/api/v1/collect/verify', array(
        'headers' => array(
            'X-Api-Key' => $api_key
        ),
        'timeout' => 10
    ));
    
    if (is_wp_error($response)) {
        wp_send_json_error(array('message' => 'Connection failed: ' . $response->get_error_message()));
        return;
    }
    
    $body = json_decode(wp_remote_retrieve_body($response), true);
    
    if (isset($body['valid']) && $body['valid']) {
        $site_id = isset($body['site_id']) ? sanitize_text_field($body['site_id']) : '';
        $verified_at = current_time('mysql');

        if ($site_id) {
            update_option('woosaas_verified_site_id', $site_id, false);
        }

        update_option('woosaas_last_verified_at', $verified_at, false);

        wp_send_json_success(array(
            'message' => 'API key is valid! Site ID: ' . ($site_id ? $site_id : 'N/A'),
            'siteId' => $site_id,
            'verifiedAt' => $verified_at,
            'trackingCode' => Woosaas_Admin::build_tracking_code($api_url, $api_key),
            'response' => $body,
        ));
    } else {
        wp_send_json_error(array(
            'message' => $body['message'] ?? 'Invalid API key',
            'response' => $body,
        ));
    }
});

add_action('wp_ajax_woosaas_send_debug_event', function() {
    check_ajax_referer('woosaas_debug_event', 'nonce');

    $event_name = isset($_POST['event_name']) ? sanitize_text_field(wp_unslash($_POST['event_name'])) : '';
    $api_url = get_option('woosaas_api_url', 'https://api.woosaas.com');
    $api_key = get_option('woosaas_api_key', '');

    if (!in_array($event_name, array('pageview', 'product_view', 'add_to_cart', 'checkout_start', 'purchase'), true)) {
        wp_send_json_error(array('message' => __('Unsupported event type.', 'woosaas')));
        return;
    }

    if (empty($api_key)) {
        wp_send_json_error(array('message' => __('API key is required before sending debug events.', 'woosaas')));
        return;
    }

    $response = Woosaas_Admin::send_debug_event($event_name, $api_url, $api_key);

    if (is_wp_error($response)) {
        wp_send_json_error(array('message' => $response->get_error_message()));
        return;
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);
    $status = wp_remote_retrieve_response_code($response);

    if ($status >= 200 && $status < 300) {
        $debugged_at = current_time('mysql');
        update_option('woosaas_last_debug_event_at', $debugged_at, false);
        update_option('woosaas_last_debug_event_name', $event_name, false);

        wp_send_json_success(array(
            'message' => sprintf(__('Debug event "%s" accepted by collect API.', 'woosaas'), $event_name),
            'debuggedAt' => $debugged_at,
            'response' => $body,
        ));
        return;
    }

    wp_send_json_error(array(
        'message' => isset($body['error']) ? $body['error'] : __('Collect API rejected the debug event.', 'woosaas'),
        'response' => $body,
    ));
});