package teams

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type TeamsService struct {
	// pg driver.Conn would be injected
}

type Role struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
}

var Roles = []Role{
	{
		ID:   "owner",
		Name: "Owner",
		Permissions: []string{
			"site:read", "site:write", "site:delete",
			"api_keys:read", "api_keys:write",
			"users:read", "users:write", "users:delete",
			"billing:read", "billing:write",
			"export:read",
		},
	},
	{
		ID:   "admin",
		Name: "Admin",
		Permissions: []string{
			"site:read", "site:write",
			"api_keys:read", "api_keys:write",
			"users:read", "users:write",
			"export:read",
		},
	},
	{
		ID:   "editor",
		Name: "Editor",
		Permissions: []string{
			"site:read",
			"export:read",
		},
	},
	{
		ID:   "viewer",
		Name: "Viewer",
		Permissions: []string{
			"site:read",
		},
	},
}

func IsValidRole(role string) bool {
	for _, candidate := range Roles {
		if candidate.ID == role {
			return true
		}
	}
	return false
}

func HasPermission(role, permission string) bool {
	for _, candidate := range Roles {
		if candidate.ID != role {
			continue
		}
		for _, granted := range candidate.Permissions {
			if granted == permission || granted == "*" {
				return true
			}
		}
		return false
	}
	return false
}

func PermissionsForRole(role string) []string {
	for _, candidate := range Roles {
		if candidate.ID == role {
			permissions := make([]string, len(candidate.Permissions))
			copy(permissions, candidate.Permissions)
			return permissions
		}
	}
	return []string{}
}

type SiteMember struct {
	ID        string    `json:"id"`
	SiteID    string    `json:"site_id"`
	UserID    string    `json:"user_id"`
	UserEmail string    `json:"user_email"`
	UserName  string    `json:"user_name"`
	Role      string    `json:"role"`
	InvitedAt time.Time `json:"invited_at"`
	JoinedAt  time.Time `json:"joined_at"`
}

type Invite struct {
	ID        string    `json:"id"`
	SiteID    string    `json:"site_id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	Status    string    `json:"status"` // pending, accepted, expired
}

// AddMember invites a user to a site
func (s *TeamsService) AddMember(ctx context.Context, siteID, email, role string) (*Invite, error) {
	// Validate role
	if !IsValidRole(role) {
		return nil, &ValidationError{Field: "role", Message: "invalid role"}
	}

	invite := &Invite{
		ID:        uuid.New().String(),
		SiteID:    siteID,
		Email:     email,
		Role:      role,
		Token:     uuid.New().String(),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour), // 7 days
		Status:    "pending",
	}

	// Insert into PostgreSQL
	return invite, nil
}

// GetMembers returns all members of a site
func (s *TeamsService) GetMembers(ctx context.Context, siteID string) ([]SiteMember, error) {
	return []SiteMember{}, nil // Would query PostgreSQL
}

// UpdateMemberRole updates a member's role
func (s *TeamsService) UpdateMemberRole(ctx context.Context, memberID, newRole string) error {
	return nil // Would update PostgreSQL
}

// RemoveMember removes a user from a site
func (s *TeamsService) RemoveMember(ctx context.Context, memberID string) error {
	return nil // Would delete from PostgreSQL
}

// GetUserSites returns all sites a user has access to with their role
func (s *TeamsService) GetUserSites(ctx context.Context, userID string) ([]SiteMember, error) {
	return []SiteMember{}, nil // Would query PostgreSQL
}

// HasPermission checks if a user has a specific permission for a site
func (s *TeamsService) HasPermission(ctx context.Context, userID, siteID, permission string) (bool, error) {
	// Get user's role for this site
	members, err := s.GetMembers(ctx, siteID)
	if err != nil {
		return false, err
	}

	for _, m := range members {
		if m.UserID == userID {
			for _, r := range Roles {
				if r.ID == m.Role {
					return HasPermission(r.ID, permission), nil
				}
			}
		}
	}

	return false, nil
}

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return e.Message
}
