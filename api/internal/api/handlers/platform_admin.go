package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/accnet/woosaas/api/internal/auth"
	appCrypto "github.com/accnet/woosaas/api/internal/crypto"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PlatformAdminHandler struct {
	db            *pgxpool.Pool
	jwt           *auth.JWTManager
	encryptionKey []byte
	apiBaseURL    string
}

func NewPlatformAdminHandler(db *pgxpool.Pool, jwt *auth.JWTManager, encryptionKey []byte, apiBaseURL string) *PlatformAdminHandler {
	return &PlatformAdminHandler{db: db, jwt: jwt, encryptionKey: encryptionKey, apiBaseURL: strings.TrimRight(apiBaseURL, "/")}
}

type platformAdminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *PlatformAdminHandler) Login(c *gin.Context) {
	var req platformAdminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	admin, err := h.getAdminByEmail(c, req.Email)
	if err != nil || admin.Status != "active" || !auth.CheckPassword(req.Password, admin.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	if _, err := h.db.Exec(c.Request.Context(), `UPDATE platform_admin_users SET last_login_at = NOW() WHERE id = $1`, admin.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update admin login timestamp"})
		return
	}
	token, err := h.jwt.GeneratePlatformAdminToken(admin.ID, admin.Email, admin.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "admin": admin.safe()})
}

func (h *PlatformAdminHandler) Me(c *gin.Context) {
	admin, ok := c.Get("platform_admin")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"admin": admin})
}

func (h *PlatformAdminHandler) AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}
		claims, err := h.jwt.ValidateToken(strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer ")))
		if err != nil || claims.TokenType != "platform_admin" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}
		admin, err := h.getAdminByID(c, claims.UserID)
		if err != nil || admin.Status != "active" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}
		c.Set("platform_admin_id", admin.ID)
		c.Set("platform_admin", admin.safe())
		c.Next()
	}
}

func (h *PlatformAdminHandler) ListUsers(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT u.id, u.email, u.name, COALESCE(u.status, 'active'), u.created_at, COALESCE(s.plan_id, 'free')
		FROM users u
		LEFT JOIN subscriptions s ON s.user_id = u.id
		WHERE u.deleted_at IS NULL
		ORDER BY u.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load users"})
		return
	}
	defer rows.Close()
	users := []gin.H{}
	for rows.Next() {
		var id, email, name, status, planID string
		var createdAt any
		if err := rows.Scan(&id, &email, &name, &status, &createdAt, &planID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan users"})
			return
		}
		users = append(users, gin.H{"id": id, "email": email, "name": name, "status": status, "plan_id": planID, "created_at": createdAt})
	}
	c.JSON(http.StatusOK, gin.H{"users": users, "total": len(users), "page": 1, "per_page": 100})
}

func (h *PlatformAdminHandler) UpdateUserStatus(c *gin.Context) {
	userID := c.Param("user_id")
	var req struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}
	if _, err := h.db.Exec(c.Request.Context(), `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1`, userID, req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}
	h.audit(c, "update_user_status", "user", userID, req.Reason)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *PlatformAdminHandler) UpdateUserPlan(c *gin.Context) {
	userID := c.Param("user_id")
	var req struct {
		PlanID string `json:"plan_id"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan_id is required"})
		return
	}
	if _, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
		VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 month')
		ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', updated_at = NOW()
	`, userID, req.PlanID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update plan"})
		return
	}
	h.audit(c, "update_user_plan", "user", userID, req.Reason)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *PlatformAdminHandler) ListPlans(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `SELECT id, name, price_cents, interval, event_limit, site_limit, tracking_order_limit, features FROM plans ORDER BY price_cents`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load plans"})
		return
	}
	defer rows.Close()
	plans := []gin.H{}
	for rows.Next() {
		var id, name, interval string
		var price, siteLimit int
		var eventLimit, trackingLimit int64
		var features []byte
		if err := rows.Scan(&id, &name, &price, &interval, &eventLimit, &siteLimit, &trackingLimit, &features); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan plans"})
			return
		}
		plans = append(plans, gin.H{"id": id, "name": name, "price_cents": price, "interval": interval, "event_limit": eventLimit, "site_limit": siteLimit, "tracking_order_limit": trackingLimit, "features": string(features)})
	}
	c.JSON(http.StatusOK, gin.H{"plans": plans})
}

func (h *PlatformAdminHandler) UpdatePlan(c *gin.Context) {
	planID := c.Param("plan_id")
	var req struct {
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		PriceCents         *int     `json:"price_cents"`
		EventLimit         *int64   `json:"event_limit"`
		SiteLimit          *int     `json:"site_limit"`
		TrackingOrderLimit *int64   `json:"tracking_order_limit"`
		Features           []string `json:"features"`
		Reason             string   `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	features, _ := json.Marshal(req.Features)
	if _, err := h.db.Exec(c.Request.Context(), `
		UPDATE plans
		SET name = COALESCE(NULLIF($2, ''), name),
			description = COALESCE(NULLIF($3, ''), description),
			price_cents = COALESCE($4, price_cents),
			event_limit = COALESCE($5, event_limit),
			site_limit = COALESCE($6, site_limit),
			tracking_order_limit = COALESCE($7, tracking_order_limit),
			features = CASE WHEN $8::jsonb = 'null'::jsonb THEN features ELSE $8::jsonb END,
			updated_at = NOW()
		WHERE id = $1
	`, planID, req.Name, req.Description, req.PriceCents, req.EventLimit, req.SiteLimit, req.TrackingOrderLimit, features); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update plan"})
		return
	}
	h.audit(c, "update_plan", "plan", "", req.Reason+" plan="+planID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *PlatformAdminHandler) ListAuditLogs(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, admin_id, action, target_type, target_id, COALESCE(reason, ''), created_at
		FROM platform_admin_audit_logs
		ORDER BY created_at DESC
		LIMIT 100
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load audit logs"})
		return
	}
	defer rows.Close()
	logs := []gin.H{}
	for rows.Next() {
		var id, action, targetType, reason string
		var adminID, targetID *string
		var createdAt any
		if err := rows.Scan(&id, &adminID, &action, &targetType, &targetID, &reason, &createdAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan audit logs"})
			return
		}
		logs = append(logs, gin.H{"id": id, "admin_id": adminID, "action": action, "target_type": targetType, "target_id": targetID, "reason": reason, "created_at": createdAt})
	}
	c.JSON(http.StatusOK, gin.H{"audit_logs": logs})
}

func (h *PlatformAdminHandler) ListTrackingProviders(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, display_name, enabled, COALESCE(base_url, ''), supports_webhooks, supports_refresh, supports_register,
		       COALESCE(api_key_encrypted, '') <> '', COALESCE(webhook_secret_encrypted, '') <> ''
		FROM tracking_providers
		ORDER BY display_name
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load providers"})
		return
	}
	defer rows.Close()
	providers := []gin.H{}
	for rows.Next() {
		var id, name, baseURL string
		var enabled, webhooks, refresh, register, hasAPIKey, hasWebhookSecret bool
		if err := rows.Scan(&id, &name, &enabled, &baseURL, &webhooks, &refresh, &register, &hasAPIKey, &hasWebhookSecret); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to scan providers"})
			return
		}
		providers = append(providers, gin.H{
			"id": id, "display_name": name, "enabled": enabled, "base_url": baseURL,
			"supports_webhooks": webhooks, "supports_refresh": refresh, "supports_register": register,
			"has_api_key": hasAPIKey, "has_webhook_secret": hasWebhookSecret,
			"webhook_url": h.apiBaseURL + "/api/v1/shipment-tracking/webhooks/" + id,
		})
	}
	c.JSON(http.StatusOK, gin.H{"providers": providers})
}

func (h *PlatformAdminHandler) UpdateTrackingProvider(c *gin.Context) {
	providerID := c.Param("provider_id")
	var req struct {
		Enabled       *bool  `json:"enabled"`
		BaseURL       string `json:"base_url"`
		APIKey        string `json:"api_key"`
		WebhookSecret string `json:"webhook_secret"`
		Reason        string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	apiKeyEncrypted, err := h.encryptOptional(req.APIKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not encrypt API key"})
		return
	}
	webhookSecretEncrypted, err := h.encryptOptional(req.WebhookSecret)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Could not encrypt webhook secret"})
		return
	}
	if _, err := h.db.Exec(c.Request.Context(), `
		UPDATE tracking_providers
		SET enabled = COALESCE($2::boolean, enabled),
			base_url = COALESCE(NULLIF($3::text, ''), base_url),
			api_key_encrypted = COALESCE(NULLIF($4::text, ''), api_key_encrypted),
			webhook_secret_encrypted = COALESCE(NULLIF($5::text, ''), webhook_secret_encrypted),
			updated_at = NOW()
		WHERE id = $1
	`, providerID, req.Enabled, req.BaseURL, apiKeyEncrypted, webhookSecretEncrypted); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update provider"})
		return
	}
	h.audit(c, "update_tracking_provider", "tracking_provider", providerID, req.Reason)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type smtpSettingsResponse struct {
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	FromEmail   string `json:"from_email"`
	FromName    string `json:"from_name"`
	Encryption  string `json:"encryption"`
	HasPassword bool   `json:"has_password"`
}

func (h *PlatformAdminHandler) GetSMTPSettings(c *gin.Context) {
	settings, err := h.getSystemSettings(c, "smtp.")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load SMTP settings"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"smtp": buildSMTPSettingsResponse(settings)})
}

func (h *PlatformAdminHandler) UpdateSMTPSettings(c *gin.Context) {
	var req struct {
		Enabled       *bool  `json:"enabled"`
		Host          string `json:"host"`
		Port          *int   `json:"port"`
		Username      string `json:"username"`
		Password      string `json:"password"`
		ClearPassword bool   `json:"clear_password"`
		FromEmail     string `json:"from_email"`
		FromName      string `json:"from_name"`
		Encryption    string `json:"encryption"`
		Reason        string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	encryption := strings.TrimSpace(req.Encryption)
	if encryption == "" {
		encryption = "none"
	}
	if encryption != "none" && encryption != "tls" && encryption != "starttls" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "encryption must be none, tls, or starttls"})
		return
	}
	if req.Port != nil && (*req.Port < 1 || *req.Port > 65535) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "port must be between 1 and 65535"})
		return
	}

	updates := map[string]systemSettingValue{
		"smtp.host":       {Value: strings.TrimSpace(req.Host)},
		"smtp.username":   {Value: strings.TrimSpace(req.Username)},
		"smtp.from_email": {Value: strings.TrimSpace(req.FromEmail)},
		"smtp.from_name":  {Value: strings.TrimSpace(req.FromName)},
		"smtp.encryption": {Value: encryption},
	}
	if req.Enabled != nil {
		updates["smtp.enabled"] = systemSettingValue{Value: strconv.FormatBool(*req.Enabled)}
	}
	if req.Port != nil {
		updates["smtp.port"] = systemSettingValue{Value: strconv.Itoa(*req.Port)}
	}
	if req.ClearPassword {
		updates["smtp.password"] = systemSettingValue{Value: "", Encrypted: true}
	} else if strings.TrimSpace(req.Password) != "" {
		encrypted, err := h.encryptOptional(req.Password)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Could not encrypt SMTP password"})
			return
		}
		updates["smtp.password"] = systemSettingValue{Value: encrypted, Encrypted: true}
	}

	if err := h.upsertSystemSettings(c, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update SMTP settings"})
		return
	}
	h.audit(c, "update_system_settings", "system_settings", "", req.Reason+" smtp")

	settings, err := h.getSystemSettings(c, "smtp.")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reload SMTP settings"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"smtp": buildSMTPSettingsResponse(settings)})
}

type systemSettingValue struct {
	Value     string
	Encrypted bool
}

func (h *PlatformAdminHandler) getSystemSettings(c *gin.Context, prefix string) (map[string]systemSettingValue, error) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT key, value, encrypted
		FROM system_settings
		WHERE key LIKE $1
	`, prefix+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := map[string]systemSettingValue{}
	for rows.Next() {
		var key, value string
		var encrypted bool
		if err := rows.Scan(&key, &value, &encrypted); err != nil {
			return nil, err
		}
		settings[key] = systemSettingValue{Value: value, Encrypted: encrypted}
	}
	return settings, rows.Err()
}

func (h *PlatformAdminHandler) upsertSystemSettings(c *gin.Context, updates map[string]systemSettingValue) error {
	tx, err := h.db.Begin(c.Request.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Request.Context())

	for key, setting := range updates {
		if _, err := tx.Exec(c.Request.Context(), `
			INSERT INTO system_settings (key, value, encrypted, updated_at)
			VALUES ($1, $2, $3, NOW())
			ON CONFLICT (key) DO UPDATE
			SET value = EXCLUDED.value,
				encrypted = EXCLUDED.encrypted,
				updated_at = NOW()
		`, key, setting.Value, setting.Encrypted); err != nil {
			return err
		}
	}
	return tx.Commit(c.Request.Context())
}

func buildSMTPSettingsResponse(settings map[string]systemSettingValue) smtpSettingsResponse {
	port := 587
	if rawPort := settings["smtp.port"].Value; rawPort != "" {
		if parsed, err := strconv.Atoi(rawPort); err == nil {
			port = parsed
		}
	}
	enabled, _ := strconv.ParseBool(settings["smtp.enabled"].Value)
	encryption := settings["smtp.encryption"].Value
	if encryption == "" {
		encryption = "starttls"
	}

	return smtpSettingsResponse{
		Enabled:     enabled,
		Host:        settings["smtp.host"].Value,
		Port:        port,
		Username:    settings["smtp.username"].Value,
		FromEmail:   settings["smtp.from_email"].Value,
		FromName:    settings["smtp.from_name"].Value,
		Encryption:  encryption,
		HasPassword: settings["smtp.password"].Value != "",
	}
}

func (h *PlatformAdminHandler) encryptOptional(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	return appCrypto.Encrypt(value, h.encryptionKey)
}

func (h *PlatformAdminHandler) StartImpersonation(c *gin.Context) {
	var req struct {
		UserID string `json:"user_id"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.UserID == "" || strings.TrimSpace(req.Reason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and reason are required"})
		return
	}
	var memberID, email, role string
	if err := h.db.QueryRow(c.Request.Context(), `
		SELECT id, email, role
		FROM users_members
		WHERE user_id = $1 AND status = 'active'
		ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
		LIMIT 1
	`, req.UserID).Scan(&memberID, &email, &role); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active tenant member found"})
		return
	}
	token, err := h.jwt.GenerateTenantToken(req.UserID, memberID, email, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create impersonation token"})
		return
	}
	var sessionID string
	if err := h.db.QueryRow(c.Request.Context(), `
		INSERT INTO platform_admin_impersonation_sessions (admin_id, user_id, reason)
		VALUES ($1, $2, $3)
		RETURNING id
	`, c.GetString("platform_admin_id"), req.UserID, req.Reason).Scan(&sessionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create impersonation session"})
		return
	}
	h.audit(c, "impersonation_start", "user", req.UserID, req.Reason)
	c.JSON(http.StatusCreated, gin.H{"session_id": sessionID, "token": token})
}

func (h *PlatformAdminHandler) EndImpersonation(c *gin.Context) {
	sessionID := c.Param("session_id")
	if _, err := h.db.Exec(c.Request.Context(), `
		UPDATE platform_admin_impersonation_sessions
		SET ended_at = NOW()
		WHERE id = $1 AND admin_id = $2 AND ended_at IS NULL
	`, sessionID, c.GetString("platform_admin_id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to end impersonation"})
		return
	}
	h.audit(c, "impersonation_end", "impersonation_session", sessionID, "")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type platformAdmin struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	FullName     string `json:"full_name"`
	Role         string `json:"role"`
	Status       string `json:"status"`
}

func (a platformAdmin) safe() gin.H {
	return gin.H{"id": a.ID, "email": a.Email, "full_name": a.FullName, "role": a.Role, "status": a.Status}
}

func (h *PlatformAdminHandler) getAdminByEmail(c *gin.Context, email string) (*platformAdmin, error) {
	var a platformAdmin
	err := h.db.QueryRow(c.Request.Context(), `SELECT id, email, password_hash, COALESCE(full_name, ''), role, status FROM platform_admin_users WHERE LOWER(email) = LOWER($1)`, email).
		Scan(&a.ID, &a.Email, &a.PasswordHash, &a.FullName, &a.Role, &a.Status)
	return &a, err
}

func (h *PlatformAdminHandler) getAdminByID(c *gin.Context, id string) (*platformAdmin, error) {
	var a platformAdmin
	err := h.db.QueryRow(c.Request.Context(), `SELECT id, email, password_hash, COALESCE(full_name, ''), role, status FROM platform_admin_users WHERE id = $1`, id).
		Scan(&a.ID, &a.Email, &a.PasswordHash, &a.FullName, &a.Role, &a.Status)
	return &a, err
}

func (h *PlatformAdminHandler) audit(c *gin.Context, action, targetType, targetID, reason string) {
	adminID := c.GetString("platform_admin_id")
	var targetUUID *string
	if parsed, err := uuid.Parse(targetID); err == nil {
		v := parsed.String()
		targetUUID = &v
	}
	_, _ = h.db.Exec(c.Request.Context(), `
		INSERT INTO platform_admin_audit_logs (admin_id, action, target_type, target_id, reason, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::inet, $7)
	`, adminID, action, targetType, targetUUID, reason, c.ClientIP(), c.Request.UserAgent())
}
