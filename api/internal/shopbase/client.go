package shopbase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ErrRateLimited is returned when ShopBase returns HTTP 429.
var ErrRateLimited = errors.New("shopbase: rate limited")

// ErrUnauthorized is returned when credentials are invalid.
var ErrUnauthorized = errors.New("shopbase: unauthorized")

// ErrNotFound is returned when the resource is not found.
var ErrNotFound = errors.New("shopbase: not found")

// APIError wraps a non-2xx response from ShopBase.
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("shopbase API error %d: %s", e.StatusCode, e.Message)
}

const (
	// maxRequestsPerSecond is the ShopBase Admin API rate limit.
	maxRequestsPerSecond = 2
	// minInterval is the minimum interval between requests.
	minInterval = time.Second / maxRequestsPerSecond
	// maxRetries is the number of retries for 429 and 5xx responses.
	maxRetries = 3
)

// Client is an authenticated ShopBase Admin API client.
type Client struct {
	baseURL    string
	auth       Auth
	httpClient *http.Client
	rateMu     sync.Mutex
	lastReqAt  time.Time
}

// NewClient creates a new ShopBase client for the given shop domain.
func NewClient(shopDomain string, auth Auth) *Client {
	domain := normalizeDomain(shopDomain)
	return &Client{
		baseURL: "https://" + domain,
		auth:    auth,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// normalizeDomain strips scheme and trailing slashes from a shop domain.
func normalizeDomain(domain string) string {
	domain = strings.TrimSpace(domain)
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimSuffix(domain, "/")
	return domain
}

// throttle enforces the 2 req/s rate limit by sleeping if needed.
func (c *Client) throttle(ctx context.Context) error {
	c.rateMu.Lock()
	now := time.Now()
	since := now.Sub(c.lastReqAt)
	var wait time.Duration
	if since < minInterval {
		wait = minInterval - since
	}
	c.lastReqAt = now.Add(wait)
	c.rateMu.Unlock()
	if wait > 0 {
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

func (c *Client) do(ctx context.Context, method, path string, bodyFn func() io.Reader) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if err := c.throttle(ctx); err != nil {
			return nil, err
		}

		var reqBody io.Reader
		if bodyFn != nil {
			reqBody = bodyFn()
		}
		req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
		if err != nil {
			return nil, err
		}
		req.SetBasicAuth(c.auth.APIKey, c.auth.APIPassword)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			if attempt < maxRetries {
				backoff := time.Duration(1<<uint(attempt)) * 500 * time.Millisecond
				select {
				case <-time.After(backoff):
				case <-ctx.Done():
					return nil, ctx.Err()
				}
			}
			continue
		}

		// Retry on 429 and 5xx
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			_ = resp.Body.Close()
			lastErr = &APIError{StatusCode: resp.StatusCode}
			if attempt < maxRetries {
				backoff := time.Duration(1<<uint(attempt)) * time.Second
				select {
				case <-time.After(backoff):
				case <-ctx.Done():
					return nil, ctx.Err()
				}
			}
			continue
		}
		return resp, nil
	}
	return nil, lastErr
}

func (c *Client) getJSON(ctx context.Context, path string, dest interface{}) error {
	resp, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return c.handleResponse(resp, dest)
}

func (c *Client) postJSON(ctx context.Context, path string, payload, dest interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	resp, err := c.do(ctx, http.MethodPost, path, func() io.Reader {
		return strings.NewReader(string(data))
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return c.handleResponse(resp, dest)
}

func (c *Client) handleResponse(resp *http.Response, dest interface{}) error {
	body, _ := io.ReadAll(resp.Body)
	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated:
		if dest != nil {
			return json.Unmarshal(body, dest)
		}
		return nil
	case http.StatusUnauthorized, http.StatusForbidden:
		return ErrUnauthorized
	case http.StatusNotFound:
		return ErrNotFound
	case http.StatusTooManyRequests:
		return ErrRateLimited
	default:
		msg := string(body)
		if len(msg) > 256 {
			msg = msg[:256]
		}
		return &APIError{StatusCode: resp.StatusCode, Message: msg}
	}
}

// GetShop fetches shop metadata.
func (c *Client) GetShop(ctx context.Context) (*Shop, error) {
	var result ShopResponse
	if err := c.getJSON(ctx, "/admin/shop.json", &result); err != nil {
		return nil, err
	}
	return &result.Shop, nil
}

// ListOrders returns paginated orders.
func (c *Client) ListOrders(ctx context.Context, params ListParams) ([]Order, error) {
	q := buildQuery(params)
	q.Set("status", "any")
	var result OrdersResponse
	if err := c.getJSON(ctx, "/admin/orders.json?"+q.Encode(), &result); err != nil {
		return nil, err
	}
	return result.Orders, nil
}

// GetOrder returns a single order by ID.
func (c *Client) GetOrder(ctx context.Context, id string) (*Order, error) {
	var result struct {
		Order Order `json:"order"`
	}
	if err := c.getJSON(ctx, "/admin/orders/"+id+".json", &result); err != nil {
		return nil, err
	}
	return &result.Order, nil
}

// ListCustomers returns paginated customers.
func (c *Client) ListCustomers(ctx context.Context, params ListParams) ([]Customer, error) {
	q := buildQuery(params)
	var result CustomersResponse
	if err := c.getJSON(ctx, "/admin/customers.json?"+q.Encode(), &result); err != nil {
		return nil, err
	}
	return result.Customers, nil
}

// ListProducts returns paginated products.
func (c *Client) ListProducts(ctx context.Context, params ListParams) ([]Product, error) {
	q := buildQuery(params)
	var result ProductsResponse
	if err := c.getJSON(ctx, "/admin/products.json?"+q.Encode(), &result); err != nil {
		return nil, err
	}
	return result.Products, nil
}

// ListWebhooks returns all registered webhooks.
func (c *Client) ListWebhooks(ctx context.Context) ([]Webhook, error) {
	var result WebhooksResponse
	if err := c.getJSON(ctx, "/admin/webhooks.json", &result); err != nil {
		return nil, err
	}
	return result.Webhooks, nil
}

// CreateWebhook registers a new webhook for the given topic.
func (c *Client) CreateWebhook(ctx context.Context, topic, address string) (*Webhook, error) {
	payload := WebhookCreateRequest{
		Webhook: WebhookCreate{
			Topic:   topic,
			Address: address,
			Format:  "json",
		},
	}
	var result WebhookCreateResponse
	if err := c.postJSON(ctx, "/admin/webhooks.json", payload, &result); err != nil {
		return nil, err
	}
	return &result.Webhook, nil
}

// ListScriptTags returns all registered script tags.
func (c *Client) ListScriptTags(ctx context.Context) ([]ScriptTag, error) {
	var result ScriptTagsResponse
	if err := c.getJSON(ctx, "/admin/script_tags.json", &result); err != nil {
		return nil, err
	}
	return result.ScriptTags, nil
}

// CreateScriptTag registers a new script tag.
func (c *Client) CreateScriptTag(ctx context.Context, src, displayScope string) (*ScriptTag, error) {
	payload := ScriptTagCreateRequest{
		ScriptTag: ScriptTagCreate{
			Event:        "onload",
			Src:          src,
			DisplayScope: displayScope,
		},
	}
	var result ScriptTagCreateResponse
	if err := c.postJSON(ctx, "/admin/script_tags.json", payload, &result); err != nil {
		return nil, err
	}
	return &result.ScriptTag, nil
}

func buildQuery(p ListParams) url.Values {
	q := url.Values{}
	limit := p.Limit
	if limit <= 0 || limit > 250 {
		limit = 250
	}
	q.Set("limit", strconv.Itoa(limit))
	if p.Page > 0 {
		q.Set("page", strconv.Itoa(p.Page))
	}
	if p.Status != "" {
		q.Set("status", p.Status)
	}
	if p.UpdatedAtMin != nil {
		q.Set("updated_at_min", p.UpdatedAtMin.UTC().Format(time.RFC3339))
	}
	if p.CreatedAtMin != nil {
		q.Set("created_at_min", p.CreatedAtMin.UTC().Format(time.RFC3339))
	}
	return q
}
