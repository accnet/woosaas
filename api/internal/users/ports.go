package users

import (
	"context"

	"github.com/woosaas/api/pkg/models"
)

// UserRepository is the interface for user data access.
// Consumers should depend on this interface rather than the concrete Repository.
type UserRepository interface {
	CreateUser(ctx context.Context, email, passwordHash, name string) (*models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUserByID(ctx context.Context, id string) (*models.User, error)
}
