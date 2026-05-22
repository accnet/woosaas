package email

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"

	appCrypto "github.com/accnet/woosaas/api/internal/crypto"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db            *pgxpool.Pool
	encryptionKey []byte
	appBaseURL    string
}

type smtpSettings struct {
	Enabled    bool
	Host       string
	Port       int
	Username   string
	Password   string
	FromEmail  string
	FromName   string
	Encryption string
}

func NewService(db *pgxpool.Pool, encryptionKey []byte, appBaseURL string) *Service {
	return &Service{db: db, encryptionKey: encryptionKey, appBaseURL: strings.TrimRight(appBaseURL, "/")}
}

func (s *Service) IsConfigured(ctx context.Context) error {
	settings, err := s.loadSMTPSettings(ctx)
	if err != nil {
		return err
	}
	if !settings.Enabled {
		return fmt.Errorf("SMTP is disabled")
	}
	if settings.Host == "" || settings.Port == 0 || settings.FromEmail == "" {
		return fmt.Errorf("SMTP host, port, and from email are required")
	}
	return nil
}

func (s *Service) SendActivationEmail(ctx context.Context, toEmail, name, token string) error {
	settings, err := s.loadSMTPSettings(ctx)
	if err != nil {
		return err
	}
	if err := s.validateSMTPSettings(settings); err != nil {
		return err
	}

	displayName := strings.TrimSpace(name)
	if displayName == "" {
		displayName = toEmail
	}
	activationURL := s.appBaseURL + "/activate?token=" + token
	subject := "Activate your Woosaas account"
	body := fmt.Sprintf("Hi %s,\n\nActivate your Woosaas account by opening this link:\n\n%s\n\nThis link expires in 24 hours.\n\nWoosaas", displayName, activationURL)

	headers := []string{
		"From: " + formatAddress(settings.FromName, settings.FromEmail),
		"To: " + toEmail,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
	}
	message := []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + body)
	addr := net.JoinHostPort(settings.Host, strconv.Itoa(settings.Port))

	var auth smtp.Auth
	if settings.Username != "" || settings.Password != "" {
		auth = smtp.PlainAuth("", settings.Username, settings.Password, settings.Host)
	}

	if settings.Encryption == "tls" {
		return s.sendTLS(addr, settings.Host, settings.FromEmail, []string{toEmail}, message, auth)
	}
	return s.sendPlainOrStartTLS(addr, settings.Host, settings.FromEmail, []string{toEmail}, message, auth, settings.Encryption == "starttls")
}

func (s *Service) loadSMTPSettings(ctx context.Context) (smtpSettings, error) {
	rows, err := s.db.Query(ctx, `
		SELECT key, value
		FROM system_settings
		WHERE key LIKE 'smtp.%'
	`)
	if err != nil {
		return smtpSettings{}, err
	}
	defer rows.Close()

	values := map[string]string{}
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return smtpSettings{}, err
		}
		values[key] = value
	}
	if err := rows.Err(); err != nil {
		return smtpSettings{}, err
	}

	port := 587
	if raw := values["smtp.port"]; raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			port = parsed
		}
	}
	enabled, _ := strconv.ParseBool(values["smtp.enabled"])
	password := values["smtp.password"]
	if password != "" {
		decrypted, err := appCrypto.Decrypt(password, s.encryptionKey)
		if err != nil {
			return smtpSettings{}, err
		}
		password = decrypted
	}
	encryption := strings.TrimSpace(values["smtp.encryption"])
	if encryption == "" {
		encryption = "starttls"
	}

	return smtpSettings{
		Enabled:    enabled,
		Host:       strings.TrimSpace(values["smtp.host"]),
		Port:       port,
		Username:   strings.TrimSpace(values["smtp.username"]),
		Password:   password,
		FromEmail:  strings.TrimSpace(values["smtp.from_email"]),
		FromName:   strings.TrimSpace(values["smtp.from_name"]),
		Encryption: encryption,
	}, nil
}

func (s *Service) validateSMTPSettings(settings smtpSettings) error {
	if !settings.Enabled {
		return fmt.Errorf("SMTP is disabled")
	}
	if settings.Host == "" || settings.Port == 0 || settings.FromEmail == "" {
		return fmt.Errorf("SMTP host, port, and from email are required")
	}
	if settings.Encryption != "none" && settings.Encryption != "tls" && settings.Encryption != "starttls" {
		return fmt.Errorf("SMTP encryption must be none, tls, or starttls")
	}
	return nil
}

func (s *Service) sendTLS(addr, host, from string, to []string, message []byte, auth smtp.Auth) error {
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()
	return sendWithClient(client, auth, from, to, message)
}

func (s *Service) sendPlainOrStartTLS(addr, host, from string, to []string, message []byte, auth smtp.Auth, startTLS bool) error {
	client, err := smtp.Dial(addr)
	if err != nil {
		return err
	}
	defer client.Close()

	if startTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("SMTP server does not support STARTTLS")
		}
		if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
	}
	return sendWithClient(client, auth, from, to, message)
}

func sendWithClient(client *smtp.Client, auth smtp.Auth, from string, to []string, message []byte) error {
	if auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return err
		}
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(message); err != nil {
		_ = writer.Close()
		return err
	}
	return writer.Close()
}

func formatAddress(name, email string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return email
	}
	escaped := strings.ReplaceAll(name, `"`, `\"`)
	return `"` + escaped + `" <` + email + `>`
}
