<?php

use PHPUnit\Framework\TestCase;

final class CollectorSchemaTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $_COOKIE = array(
            WOOSAAS_COOKIE_CLIENT => 'client-123',
            WOOSAAS_COOKIE_SESSION => 'session-456',
        );
        $_SERVER['REQUEST_URI'] = '/checkout/order-received';
        $_SERVER['HTTP_USER_AGENT'] = 'PHPUnit';
        $_SERVER['HTTP_REFERER'] = 'https://google.com';
    }

    public function testBuildEventPromotesEcommerceFieldsToTopLevelSchema(): void
    {
        $collector = new Woosaas_Collector();
        $reflection = new ReflectionClass($collector);
        $method = $reflection->getMethod('build_event');
        $method->setAccessible(true);

        $event = $method->invoke($collector, 'purchase', array(
            'order_id' => 'ORDER-1',
            'product_id' => 'PROD-1',
            'product_name' => 'Product 1',
            'quantity' => 2,
            'revenue' => 49.99,
            'currency' => 'USD',
            'items' => array(
                array('product_id' => 'PROD-1', 'quantity' => 2),
            ),
        ));

        $this->assertSame('ORDER-1', $event['order_id']);
        $this->assertSame('PROD-1', $event['product_id']);
        $this->assertSame('Product 1', $event['product_name']);
        $this->assertSame(2, $event['quantity']);
        $this->assertSame(49.99, $event['revenue']);
        $this->assertSame('USD', $event['currency']);
        $this->assertArrayHasKey('items_json', $event);
        $this->assertSame('https://google.com', $event['referrer']);
        $this->assertSame('/checkout/order-received', $event['path']);
        $this->assertArrayNotHasKey('order_id', $event['properties']);
        $this->assertArrayNotHasKey('product_id', $event['properties']);
        $this->assertArrayNotHasKey('items', $event['properties']);
    }
}