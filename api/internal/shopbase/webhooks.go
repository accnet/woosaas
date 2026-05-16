package shopbase

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
)

// VerifyHMAC validates the X-ShopBase-Hmac-SHA256 header against the raw request body.
// Uses constant-time comparison to prevent timing attacks.
func VerifyHMAC(rawBody []byte, hmacHeader string, secret string) bool {
	if secret == "" || hmacHeader == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(rawBody)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(hmacHeader))
}
