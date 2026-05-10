package auth

import (
	"context"
	"fmt"

	"github.com/woosaas/api/pkg/models"
)

// userRepository is the minimal interface Service needs for user data access.
type userRepository interface {
	CreateUser(ctx context.Context, email, passwordHash, name string) (*models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUserByID(ctx context.Context, id string) (*models.User, error)
}

// Service encapsulates authentication business logic.
type Service struct {
	users      userRepository
	jwtManager *JWTManager
}

func NewService(users userRepository, jwtManager *JWTManager) *Service {
	return &Service{users: users, jwtManager: jwtManager}
}

// Register creates a new user and returns the user and a signed JWT.
func (s *Service) Register(ctx context.Context, email, password, name string) (*models.User, string, error) {
	existing, _ := s.users.GetUserByEmail(ctx, email)
	if existing != nil {
		return nil, "", fmt.Errorf("email already registered")
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return nil, "", fmt.Errorf("failed to process password")
	}

	user, err := s.users.CreateUser(ctx, email, passwordHash, name)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create user")
	}

	token, err := s.jwtManager.GenerateToken(user.ID, user.Email)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token")
	}

	return user, token, nil
}

// Login validates credentials and returns the user and a signed JWT.
func (s *Service) Login(ctx context.Context, email, password string) (*models.User, string, error) {
	user, err := s.users.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, "", fmt.Errorf("invalid credentials")
	}

	if !CheckPassword(password, user.PasswordHash) {
		return nil, "", fmt.Errorf("invalid credentials")
	}

	token, err := s.jwtManager.GenerateToken(user.ID, user.Email)
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token")
	}

	return user, token, nil
}

// GetUser returns a user by ID.
func (s *Service) GetUser(ctx context.Context, userID string) (*models.User, error) {
	return s.users.GetUserByID(ctx, userID)
}
