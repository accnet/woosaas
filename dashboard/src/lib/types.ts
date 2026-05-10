export interface User {
  id: string
  email: string
  name: string
  created_at?: string
  updated_at?: string
}

export interface Site {
  id: string
  user_id: string
  name: string
  domain: string
  timezone: string
  currency: string
  tracking_status: string
  tracking_last_checked_at: string | null
  tracking_last_event_at: string | null
  created_at: string
  updated_at: string
}

export interface APIKey {
  id: string
  site_id: string
  key_prefix: string
  name: string
  status: string
  last_used_at: string | null
  created_at: string
}

export interface APIKeyResponse extends APIKey {
  key: string
}

export interface SiteMember {
  id: string
  site_id: string
  user_id: string
  user_email: string
  user_name: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  created_at: string
}

export interface SiteMembersResponse {
  members: SiteMember[]
  current_user_role: 'owner' | 'admin' | 'editor' | 'viewer'
  current_user_permissions: string[]
}

export interface TrackingVerification {
  site_id: string
  status: string
  last_checked_at: string | null
  last_event_at: string | null
  created_at: string
  updated_at: string
}

export interface TrackingInstructions {
  method: string
  plugin_url: string
  config: {
    api_key: string
    domain: string
  }
}

export interface TrackingCodeResponse {
  site: Site
  api_keys: APIKey[]
  verification: TrackingVerification | null
  instructions: TrackingInstructions
}

export interface EventResponse {
  event_id: string
  status: string
  received_at: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface CreateSiteInput {
  name: string
  domain: string
}

export interface UpdateSiteInput {
  name?: string
  timezone?: string
  currency?: string
}

export interface CreateSiteMemberInput {
  email: string
  role: 'admin' | 'editor' | 'viewer'
}

export interface UpdateSiteMemberInput {
  role: 'admin' | 'editor' | 'viewer'
}

export interface OverviewStats {
  pageviews: number
  sessions: number
  users: number
  product_views: number
  add_to_carts: number
  checkouts: number
  purchases: number
  revenue: number
  orders: number
  conversion_rate: number
  aov: number
  converting_sessions: number
}

export interface TrendPoint {
  date: string
  pageviews: number
  sessions: number
  users: number
  purchases: number
  revenue: number
}

export interface SourceStats {
  source: string
  medium: string
  pageviews: number
  sessions: number
  users: number
  conversions: number
  revenue: number
  conversion_rate: number
}

export interface CampaignStats {
  source: string
  medium: string
  campaign: string
  pageviews: number
  sessions: number
  users: number
  conversions: number
  revenue: number
  conversion_rate: number
  revenue_per_session: number
  gclid_events: number
  fbclid_events: number
  ttclid_events: number
  msclkid_events: number
}

export interface PageStats {
  path: string
  pageviews: number
  sessions: number
  product_views: number
  purchases: number
  revenue: number
  previous_pageviews: number
  previous_sessions: number
  previous_product_views: number
  previous_purchases: number
  previous_revenue: number
  pageviews_delta: number
  sessions_delta: number
  revenue_delta: number
}

export interface ProductStats {
  product_id: string
  product_name: string
  views: number
  add_to_carts: number
  purchases: number
  revenue: number
  units_sold: number
  conversion_rate: number
  add_to_cart_rate: number
  purchase_rate: number
  previous_views: number
  previous_add_to_carts: number
  previous_purchases: number
  previous_revenue: number
  previous_units_sold: number
  previous_add_to_cart_rate: number
  previous_purchase_rate: number
  views_delta: number
  revenue_delta: number
  purchase_rate_delta: number
}

export interface FunnelStats {
  pageviews: number
  product_views: number
  add_to_carts: number
  checkouts: number
  purchases: number
  product_view_rate: number
  add_to_cart_rate: number
  checkout_rate: number
  purchase_rate: number
}

export interface RealtimeStats {
  online_users: number
  minutes: number
}

export interface RealtimeEvent {
  event_time: string
  event_name: string
  client_id: string
  session_id: string
  path: string
  source: string
  medium: string
  campaign: string
  product_id: string
  product_name: string
  order_id: string
  revenue: number
  currency: string
  bot_score: number
}

export interface PipelineHealth {
  status: 'healthy' | 'degraded' | 'waiting' | 'idle'
  message: string
  stream: string
  dead_stream: string
  consumer_group: string
  stream_length: number
  queue_depth: number
  pending: number
  lag: number
  dead_letter_length: number
  consumer_count: number
  last_delivered_id: string
  last_processed_at: string | null
  last_processed_age_seconds: number
  checked_at: string
}

export interface Customer {
  client_id: string
  site_id: string
  email: string
  user_id: string
  first_seen: string
  last_seen: string
  total_sessions: number
  total_orders: number
  total_revenue: number
  avg_order_value: number
  last_source: string
  last_medium: string
  last_campaign: string
  primary_device: string
  primary_browser: string
  customer_type: string
  ltv: number
}

export interface CustomerEvent {
  event_time: string
  event_name: string
  session_id: string
  path: string
  product_id: string
  product_name: string
  order_id: string
  revenue: number
  currency: string
  source: string
  medium: string
  campaign: string
}

export interface CustomerListResponse {
  customers: Customer[]
  total_count: number
  page: number
  page_size: number
}

export interface CustomerDetailResponse {
  customer: Customer
  events: CustomerEvent[]
}

export interface OrderListItem {
  woo_order_id: string
  created_at_woo: string | null
  customer_name: string
  customer_email: string
  payment_status: string
  fulfillment_status: string
  total_amount: number
  currency: string
  items_count: number
  status: string
  contact_id: string | null
}

export interface OrderListResponse {
  orders: OrderListItem[]
  total_count: number
  page: number
  page_size: number
}

export interface OrderItem {
  line_item_id: string
  product_id: string
  variation_id: string
  sku: string
  name: string
  quantity: number
  unit_price: number
  line_subtotal: number
  line_total: number
  line_tax: number
}

export interface OrderContact {
  id: string
  email: string
  phone: string
  full_name: string
  company: string
  orders_count: number
  total_spent: number
  first_seen_at: string | null
  last_seen_at: string | null
  first_name?: string
  last_name?: string
  woo_customer_id?: string
  billing_address?: Record<string, unknown>
  shipping_address?: Record<string, unknown>
}

export interface OrderDetail {
  id: string
  site_id: string
  woo_order_id: string
  woo_customer_id: string
  status: string
  payment_status: string
  fulfillment_status: string
  currency: string
  total_amount: number
  subtotal_amount: number
  discount_amount: number
  shipping_amount: number
  tax_amount: number
  refund_amount: number
  items_count: number
  customer_email: string
  customer_first_name: string
  customer_last_name: string
  customer_phone: string
  billing_company: string
  billing_address: Record<string, unknown>
  shipping_address: Record<string, unknown>
  client_id: string
  session_id: string
  attribution: Record<string, unknown>
  contact_id: string | null
  created_at_woo: string | null
  paid_at_woo: string | null
  completed_at_woo: string | null
  modified_at_woo: string
  deleted_at_woo: string | null
  synced_at: string
  created_at: string
  updated_at: string
  raw_order: Record<string, unknown>
  items: OrderItem[]
  contact: OrderContact | null
}

export interface BotReasonStat {
  reason: string
  count: number
}

export interface BotSourceStat {
  source: string
  count: number
}

export interface BotSessionStat {
  session_id: string
  ip_hash: string
  user_agent: string
  event_count: number
  bot_score: number
}

export interface BotReportResponse {
  total_events: number
  bot_events: number
  human_events: number
  bot_percentage: number
  top_bot_reasons: BotReasonStat[]
  top_bot_sources: BotSourceStat[]
  top_bot_sessions: BotSessionStat[]
}
