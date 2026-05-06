<?php

use PHPUnit\Framework\TestCase;

final class AdminHelpersTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $GLOBALS['woosaas_options'] = array();
        $_POST = array();
        $GLOBALS['woosaas_test_remote_get'] = null;
        $GLOBALS['woosaas_test_remote_post'] = null;
    }

    public function testBuildTrackingCodeUsesSharedBootstrapAndTrackerScript(): void
    {
        $snippet = Woosaas_Admin::build_tracking_code('https://api.example.test/', 'wk_live_123');

        $this->assertStringContainsString('window.woosaas_config', $snippet);
        $this->assertStringContainsString('assets/js/tracker.js', $snippet);
        $this->assertStringContainsString('queue.push', $snippet);
        $this->assertStringContainsString('wk_live_123', $snippet);
    }

    public function testRelativeTimeHelpersReturnExpectedVariants(): void
    {
        $fresh = date('Y-m-d H:i:s', time() - 60);
        $warm = date('Y-m-d H:i:s', time() - 3600);
        $stale = date('Y-m-d H:i:s', time() - 172800);

        $this->assertSame('is-fresh', Woosaas_Admin::get_time_badge_variant($fresh));
        $this->assertSame('is-warm', Woosaas_Admin::get_time_badge_variant($warm));
        $this->assertSame('is-stale', Woosaas_Admin::get_time_badge_variant($stale));
        $this->assertStringContainsString('ago', Woosaas_Admin::format_relative_time($fresh));
    }

    public function testVerifyAjaxHandlerStoresSiteIdAndTimestamp(): void
    {
        $_POST = array(
            'api_url' => 'https://api.example.test',
            'api_key' => 'wk_live_123',
            'nonce' => 'nonce',
        );
        $GLOBALS['woosaas_test_remote_get'] = array(
            'body' => wp_json_encode(array(
                'valid' => true,
                'site_id' => '123e4567-e89b-12d3-a456-426614174001',
            )),
            'response' => array('code' => 200),
        );

        try {
            $callback = $GLOBALS['woosaas_actions']['wp_ajax_woosaas_verify_api'];
            $callback();
            $this->fail('Expected JSON response exception');
        } catch (Woosaas_Test_Json_Response $response) {
            $this->assertTrue($response->success);
            $this->assertSame('123e4567-e89b-12d3-a456-426614174001', $GLOBALS['woosaas_options']['woosaas_verified_site_id']);
            $this->assertArrayHasKey('woosaas_last_verified_at', $GLOBALS['woosaas_options']);
            $this->assertSame('123e4567-e89b-12d3-a456-426614174001', $response->payload['siteId']);
            $this->assertStringContainsString('assets/js/tracker.js', $response->payload['trackingCode']);
        }
    }

    public function testDebugAjaxHandlerStoresEventMetadataOnSuccess(): void
    {
        $capturedRequest = null;
        $_POST = array(
            'event_name' => 'purchase',
            'nonce' => 'nonce',
        );
        $GLOBALS['woosaas_options'] = array(
            'woosaas_api_url' => 'https://api.example.test',
            'woosaas_api_key' => 'wk_live_123',
        );
        $GLOBALS['woosaas_test_remote_post'] = static function ($url, $args) use (&$capturedRequest) {
            $capturedRequest = array('url' => $url, 'args' => $args);

            return array(
                'body' => wp_json_encode(array('status' => 'ok')),
                'response' => array('code' => 200),
            );
        };

        try {
            $callback = $GLOBALS['woosaas_actions']['wp_ajax_woosaas_send_debug_event'];
            $callback();
            $this->fail('Expected JSON response exception');
        } catch (Woosaas_Test_Json_Response $response) {
            $this->assertTrue($response->success);
            $this->assertSame('purchase', $GLOBALS['woosaas_options']['woosaas_last_debug_event_name']);
            $this->assertArrayHasKey('woosaas_last_debug_event_at', $GLOBALS['woosaas_options']);
            $this->assertSame('ok', $response->payload['response']['status']);
            $this->assertNotNull($capturedRequest);
            $this->assertSame('https://api.example.test/api/v1/collect', $capturedRequest['url']);
            $this->assertSame('wk_live_123', $capturedRequest['args']['headers']['X-Api-Key']);

            $payload = json_decode($capturedRequest['args']['body'], true);
            $this->assertSame('purchase', $payload['event_name']);
            $this->assertSame('debug-order-' . gmdate('YmdHis'), $payload['order_id']);
            $this->assertSame('debug-product-1', $payload['product_id']);
            $this->assertSame('admin_debug', $payload['properties']['source']);
        }
    }
}