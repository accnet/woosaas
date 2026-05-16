package crypto

import (
	"strings"
	"testing"
)

func testKey() []byte {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	return key
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := testKey()
	plaintext := "super-secret-api-key-12345"

	encrypted, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}
	if encrypted == "" {
		t.Fatal("Encrypt returned empty string")
	}
	if strings.Contains(encrypted, plaintext) {
		t.Fatal("Encrypted output should not contain plaintext")
	}

	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}
	if decrypted != plaintext {
		t.Fatalf("Round-trip mismatch: got %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptProducesUniqueOutputs(t *testing.T) {
	key := testKey()
	plaintext := "same-input"

	enc1, _ := Encrypt(plaintext, key)
	enc2, _ := Encrypt(plaintext, key)
	if enc1 == enc2 {
		t.Error("Two encryptions of same plaintext should differ (different nonces)")
	}
}

func TestDecryptWrongKeyFails(t *testing.T) {
	key1 := testKey()
	key2 := make([]byte, 32)
	for i := range key2 {
		key2[i] = byte(i + 100)
	}

	encrypted, _ := Encrypt("secret", key1)
	_, err := Decrypt(encrypted, key2)
	if err == nil {
		t.Fatal("Decrypt with wrong key should return error")
	}
}

func TestDecryptTamperedCiphertextFails(t *testing.T) {
	key := testKey()
	encrypted, _ := Encrypt("secret", key)

	// Flip a bit in the middle of the ciphertext
	runes := []byte(encrypted)
	if len(runes) > 10 {
		runes[10] ^= 0xFF
	}
	_, err := Decrypt(string(runes), key)
	if err == nil {
		t.Fatal("Decrypt of tampered ciphertext should return error")
	}
}

func TestEncryptRejectsWrongKeyLength(t *testing.T) {
	shortKey := make([]byte, 16)
	_, err := Encrypt("test", shortKey)
	if err == nil {
		t.Fatal("Encrypt should reject non-32-byte key")
	}
}

func TestDecryptRejectsWrongKeyLength(t *testing.T) {
	shortKey := make([]byte, 16)
	_, err := Decrypt("somedata", shortKey)
	if err == nil {
		t.Fatal("Decrypt should reject non-32-byte key")
	}
}

func TestEncryptEmptyString(t *testing.T) {
	key := testKey()
	encrypted, err := Encrypt("", key)
	if err != nil {
		t.Fatalf("Encrypt empty string failed: %v", err)
	}
	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt empty string failed: %v", err)
	}
	if decrypted != "" {
		t.Fatalf("Expected empty string, got %q", decrypted)
	}
}
