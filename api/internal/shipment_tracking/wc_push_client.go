package shipment_tracking

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type WCPushClient struct {
	http *http.Client
}

func NewWCPushClient() *WCPushClient {
	return &WCPushClient{http: &http.Client{Timeout: 10 * time.Second}}
}

type WCPushPayload struct {
	TrackingNumber string `json:"tracking_number"`
	CarrierName    string `json:"carrier_name"`
	Status         string `json:"status"`
	TrackingURL    string `json:"tracking_url"`
}

func (c *WCPushClient) PushTracking(ctx context.Context, baseURL, pushToken, wooOrderID string, payload WCPushPayload) error {
	if strings.TrimSpace(baseURL) == "" || strings.TrimSpace(pushToken) == "" {
		return fmt.Errorf("WooCommerce push URL/token is not configured")
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	endpoint, hostHeader, err := buildWCPushURL(baseURL, wooOrderID)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Woosaas-Push-Token", pushToken)
	if hostHeader != "" {
		req.Host = hostHeader
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("WooCommerce push failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
}

func buildWCPushURL(baseURL, wooOrderID string) (endpoint string, hostHeader string, err error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return "", "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", "", fmt.Errorf("invalid WooCommerce push URL")
	}

	originalHost := parsed.Host
	hostName := parsed.Hostname()
	if shouldRouteViaDockerHost(hostName) {
		hostHeader = originalHost
		if port := parsed.Port(); port != "" {
			parsed.Host = net.JoinHostPort("host.docker.internal", port)
		} else {
			parsed.Host = "host.docker.internal"
		}
	}

	parsed.Path = strings.TrimRight(parsed.Path, "/") + fmt.Sprintf("/orders/%s/tracking", url.PathEscape(wooOrderID))
	return parsed.String(), hostHeader, nil
}

func shouldRouteViaDockerHost(hostName string) bool {
	if strings.HasSuffix(hostName, ".local") {
		return true
	}
	ip := net.ParseIP(hostName)
	return ip != nil && ip.IsLoopback()
}
