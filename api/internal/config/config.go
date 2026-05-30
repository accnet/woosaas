package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// Server
	Port string
	Host string

	// JWT
	JWTSecret string
	JWTExpiry time.Duration

	// CORS
	CORSAllowedOrigins []string

	// PostgreSQL
	PostgresHost     string
	PostgresPort     string
	PostgresUser     string
	PostgresPassword string
	PostgresDB       string

	// ClickHouse
	ClickHouseHost     string
	ClickHousePort     string
	ClickHouseDatabase string
	ClickHouseUser     string
	ClickHousePassword string
	ClickHouseDebug    bool

	// Redis
	RedisHost     string
	RedisPort     string
	RedisPassword string

	// Worker
	WorkerBatchSize     int
	WorkerFlushInterval time.Duration
	WorkerMaxRetries    int

	// Security
	IPHashSalt              string
	AllowInsecurePublicURLs bool

	// Platform admin bootstrap
	PlatformAdminEmail    string
	PlatformAdminPassword string
	PlatformAdminName     string
	PlatformAdminRole     string

	// ShopBase / integrations
	IntegrationEncryptionKey string // 32-byte key, base64-encoded
	TrackerBaseURL           string // e.g. https://app.woosaas.com
	APIBaseURL               string // public API URL for webhook callbacks
	AppBaseURL               string // public frontend URL for user-facing links
}

func Load() *Config {
	corsOrigins := getEnvSlice("CORS_ALLOWED_ORIGINS", []string{
		"http://localhost:3000",
		"http://localhost:3001",
	})

	return &Config{
		Port: getEnv("PORT", "8080"),
		Host: getEnv("HOST", "0.0.0.0"),

		JWTSecret: getEnv("JWT_SECRET", "change-me-in-production"),
		JWTExpiry: getDurationEnv("JWT_EXPIRY", 24*time.Hour),

		CORSAllowedOrigins: corsOrigins,

		PostgresHost:     getEnv("POSTGRES_HOST", "localhost"),
		PostgresPort:     getEnv("POSTGRES_PORT", "5432"),
		PostgresUser:     getEnv("POSTGRES_USER", "postgres"),
		PostgresPassword: getEnv("POSTGRES_PASSWORD", ""),
		PostgresDB:       getEnv("POSTGRES_DB", "woosaas"),

		ClickHouseHost:     getEnv("CLICKHOUSE_HOST", "localhost"),
		ClickHousePort:     getEnv("CLICKHOUSE_PORT", "9000"),
		ClickHouseDatabase: getEnv("CLICKHOUSE_DB", "woosaas"),
		ClickHouseUser:     getEnv("CLICKHOUSE_USER", "default"),
		ClickHousePassword: getEnv("CLICKHOUSE_PASSWORD", ""),
		ClickHouseDebug:    getEnvBool("CLICKHOUSE_DEBUG", false),

		RedisHost:     getEnv("REDIS_HOST", "localhost"),
		RedisPort:     getEnv("REDIS_PORT", "6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),

		WorkerBatchSize:     getEnvInt("WORKER_BATCH_SIZE", 1000),
		WorkerFlushInterval: time.Duration(getEnvInt("WORKER_FLUSH_INTERVAL", 2)) * time.Second,
		WorkerMaxRetries:    getEnvInt("WORKER_MAX_RETRIES", 3),

		IPHashSalt:              getEnv("IP_HASH_SALT", "woosaas-salt-default"),
		AllowInsecurePublicURLs: getEnvBool("ALLOW_INSECURE_PUBLIC_URLS", false),
		PlatformAdminEmail:      getEnv("PLATFORM_ADMIN_EMAIL", "admin@woosaas.com"),
		PlatformAdminPassword:   getEnv("PLATFORM_ADMIN_PASSWORD", "Admin123!"),
		PlatformAdminName:       getEnv("PLATFORM_ADMIN_NAME", "Platform Admin"),
		PlatformAdminRole:       getEnv("PLATFORM_ADMIN_ROLE", "owner"),

		IntegrationEncryptionKey: getEnv("INTEGRATION_ENCRYPTION_KEY", ""),
		TrackerBaseURL:           getEnv("TRACKER_BASE_URL", "https://app.woosaas.com"),
		APIBaseURL:               getEnv("API_BASE_URL", "http://localhost:8080"),
		AppBaseURL:               getEnv("APP_BASE_URL", "http://localhost:3000"),
	}
}

func (c *Config) PostgresDSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		c.PostgresUser, c.PostgresPassword, c.PostgresHost, c.PostgresPort, c.PostgresDB)
}

func (c *Config) ClickHouseDSN() string {
	return fmt.Sprintf("clickhouse://%s:%s@%s:%s/%s",
		c.ClickHouseUser, c.ClickHousePassword, c.ClickHouseHost, c.ClickHousePort, c.ClickHouseDatabase)
}

func (c *Config) RedisAddr() string {
	return fmt.Sprintf("%s:%s", c.RedisHost, c.RedisPort)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}

func getDurationEnv(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		parts := strings.Split(value, ",")
		result := make([]string, 0, len(parts))
		for _, p := range parts {
			if p = strings.TrimSpace(p); p != "" {
				result = append(result, p)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultValue
}

type PostgresConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
}

type ClickHouseConfig struct {
	Host     string
	Port     string
	Database string
	User     string
	Password string
	Debug    bool
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
}

func (c *Config) ToPostgresConfig() PostgresConfig {
	return PostgresConfig{
		Host:     c.PostgresHost,
		Port:     c.PostgresPort,
		User:     c.PostgresUser,
		Password: c.PostgresPassword,
		Database: c.PostgresDB,
	}
}

func (c *Config) ToClickHouseConfig() ClickHouseConfig {
	return ClickHouseConfig{
		Host:     c.ClickHouseHost,
		Port:     c.ClickHousePort,
		Database: c.ClickHouseDatabase,
		User:     c.ClickHouseUser,
		Password: c.ClickHousePassword,
		Debug:    c.ClickHouseDebug,
	}
}

func (c *Config) ToRedisConfig() RedisConfig {
	return RedisConfig{
		Host:     c.RedisHost,
		Port:     c.RedisPort,
		Password: c.RedisPassword,
	}
}
