package users

import (
	"context"

	"github.com/accnet/woosaas/api/pkg/models"
)

// UserRepository is the interface for user data access.
// Consumers should depend on this interface rather than the concrete Repository.
type UserRepository interface {
	CreateUser(ctx context.Context, email, passwordHash, name string) (*models.User, error)
	CreateAccountWithOwner(ctx context.Context, email, passwordHash, name string) (*models.User, *models.UserMember, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUserByID(ctx context.Context, id string) (*models.User, error)
	GetMemberByEmailWithAccount(ctx context.Context, email string) (*models.UserMember, *models.User, error)
	GetMemberByIDWithAccount(ctx context.Context, memberID string) (*models.UserMember, *models.User, error)
	UpdateUser(ctx context.Context, id, name string) (*models.User, error)
	UpdateMemberProfile(ctx context.Context, memberID, fullName string) (*models.UserMember, error)
	UpdatePassword(ctx context.Context, id, passwordHash string) error
	UpdateMemberPassword(ctx context.Context, memberID, passwordHash string) error
}
