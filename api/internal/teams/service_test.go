package teams

import "testing"

func TestIsValidRole(t *testing.T) {
	if !IsValidRole("owner") {
		t.Fatal("expected owner role to be valid")
	}
	if IsValidRole("ghost") {
		t.Fatal("expected ghost role to be invalid")
	}
}

func TestHasPermission(t *testing.T) {
	if !HasPermission("admin", "api_keys:write") {
		t.Fatal("expected admin to have api_keys:write")
	}
	if HasPermission("viewer", "site:delete") {
		t.Fatal("expected viewer to lack site:delete")
	}
}
