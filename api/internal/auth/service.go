package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
)

// userRepository is the minimal interface Service needs for user data access.
type userRepository interface {
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
	CreateEmailActivationToken(ctx context.Context, memberID, token string, expiresAt time.Time) error
	ActivateMemberByToken(ctx context.Context, token string) (*models.UserMember, *models.User, error)
	DeleteAccount(ctx context.Context, userID string) error
}

type activationEmailSender interface {
	IsConfigured(ctx context.Context) error
	SendActivationEmail(ctx context.Context, toEmail, name, token string) error
}

// Service encapsulates authentication business logic.
type Service struct {
	users           userRepository
	jwtManager      *JWTManager
	activationEmail activationEmailSender
}

func NewService(users userRepository, jwtManager *JWTManager, activationEmail activationEmailSender) *Service {
	return &Service{users: users, jwtManager: jwtManager, activationEmail: activationEmail}
}

// Register creates a pending account and sends an activation email.
func (s *Service) Register(ctx context.Context, email, password, name string) (*models.User, *models.UserMember, error) {
	if s.activationEmail == nil {
		return nil, nil, fmt.Errorf("activation email is not configured")
	}
	if err := s.activationEmail.IsConfigured(ctx); err != nil {
		return nil, nil, fmt.Errorf("activation email is not configured")
	}

	existingMember, _, _ := s.users.GetMemberByEmailWithAccount(ctx, email)
	if existingMember != nil {
		return nil, nil, fmt.Errorf("email already registered")
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to process password")
	}

	user, member, err := s.users.CreateAccountWithOwner(ctx, email, passwordHash, name)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create user")
	}

	token, err := generateActivationToken()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate activation token")
	}
	if err := s.users.CreateEmailActivationToken(ctx, member.ID, token, time.Now().Add(24*time.Hour)); err != nil {
		return nil, nil, fmt.Errorf("failed to create activation token")
	}

	if err := s.activationEmail.SendActivationEmail(ctx, member.Email, member.FullName, token); err != nil {
		_ = s.users.DeleteAccount(ctx, user.ID)
		return nil, nil, fmt.Errorf("failed to send activation email")
	}

	return user, member, nil
}

func (s *Service) Activate(ctx context.Context, token string) (*models.User, *models.UserMember, string, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil, "", fmt.Errorf("activation token is required")
	}
	member, user, err := s.users.ActivateMemberByToken(ctx, token)
	if err != nil {
		return nil, nil, "", fmt.Errorf("invalid or expired activation token")
	}
	jwtToken, err := s.jwtManager.GenerateTenantToken(user.ID, member.ID, member.Email, member.Role)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to generate token")
	}
	return user, member, jwtToken, nil
}

// Login validates credentials and returns the user and a signed JWT.
func (s *Service) Login(ctx context.Context, email, password string) (*models.User, *models.UserMember, string, error) {
	member, user, err := s.users.GetMemberByEmailWithAccount(ctx, email)
	if err != nil {
		return nil, nil, "", fmt.Errorf("invalid credentials")
	}

	if user.Status != "active" || member.Status != "active" {
		if member.Status == "pending_activation" {
			return nil, nil, "", fmt.Errorf("email activation required")
		}
		return nil, nil, "", fmt.Errorf("invalid credentials")
	}

	if !CheckPassword(password, member.PasswordHash) {
		return nil, nil, "", fmt.Errorf("invalid credentials")
	}

	token, err := s.jwtManager.GenerateTenantToken(user.ID, member.ID, member.Email, member.Role)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to generate token")
	}

	return user, member, token, nil
}

func generateActivationToken() (string, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(token), nil
}

// GetUser returns a user by ID.
func (s *Service) GetUser(ctx context.Context, userID string) (*models.User, error) {
	return s.users.GetUserByID(ctx, userID)
}

func (s *Service) GetMember(ctx context.Context, memberID string) (*models.UserMember, *models.User, error) {
	return s.users.GetMemberByIDWithAccount(ctx, memberID)
}

func (s *Service) UpdateProfile(ctx context.Context, userID, name string) (*models.User, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	return s.users.UpdateUser(ctx, userID, name)
}

func (s *Service) UpdateMemberProfile(ctx context.Context, memberID, name string) (*models.UserMember, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	return s.users.UpdateMemberProfile(ctx, memberID, name)
}

func (s *Service) ChangePassword(ctx context.Context, memberID, currentPassword, newPassword string) error {
	if len(newPassword) < 8 {
		return fmt.Errorf("new password must be at least 8 characters")
	}

	member, _, err := s.users.GetMemberByIDWithAccount(ctx, memberID)
	if err != nil {
		return fmt.Errorf("user not found")
	}
	if !CheckPassword(currentPassword, member.PasswordHash) {
		return fmt.Errorf("current password is incorrect")
	}

	passwordHash, err := HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to process password")
	}
	return s.users.UpdateMemberPassword(ctx, memberID, passwordHash)
}
