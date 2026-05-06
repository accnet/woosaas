<?php

use PHPUnit\Framework\TestCase;

final class TrackerBootstrapTest extends TestCase
{
    public function testBootstrapScriptCreatesQueueOnlyOnce(): void
    {
        $script = Woosaas_Tracker::get_bootstrap_script();

        $this->assertStringContainsString('typeof w.woosaas === \'function\'', $script);
        $this->assertStringContainsString('queue.push', $script);
        $this->assertStringContainsString('w.woosaas = woosaas', $script);
    }

    public function testGetProductContextReturnsLocalizedProductPayload(): void
    {
        $GLOBALS['woosaas_test_is_product'] = true;
        $GLOBALS['woosaas_test_current_post_id'] = 42;
        $GLOBALS['woosaas_test_products'][42] = new class {
            public function get_id() {
                return 42;
            }

            public function get_name() {
                return 'Demo Product';
            }
        };

        $context = Woosaas_Tracker::get_product_context();

        $this->assertSame(array(
            'product_id' => '42',
            'product_name' => 'Demo Product',
        ), $context);
    }
}