package users

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateUser(ctx context.Context, email, passwordHash, name string) (*models.User, error) {
	user := &models.User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: passwordHash,
		Name:         name,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	_, err := r.db.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, user.ID, user.Email, user.PasswordHash, user.Name, user.CreatedAt, user.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

func (r *Repository) CreateAccountWithOwner(ctx context.Context, email, passwordHash, name string) (*models.User, *models.UserMember, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	name = strings.TrimSpace(name)

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	now := time.Now()
	user := &models.User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: passwordHash,
		Name:         name,
		Status:       "active",
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'active', $5, $6)
	`, user.ID, user.Email, user.PasswordHash, user.Name, user.CreatedAt, user.UpdatedAt); err != nil {
		return nil, nil, fmt.Errorf("failed to create account: %w", err)
	}

	member := &models.UserMember{
		ID:           uuid.New().String(),
		UserID:       user.ID,
		Email:        email,
		PasswordHash: passwordHash,
		FullName:     name,
		Role:         "owner",
		Status:       "pending_activation",
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO users_members (id, user_id, email, password_hash, full_name, role, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'owner', 'pending_activation', $6, $7)
	`, member.ID, member.UserID, member.Email, member.PasswordHash, member.FullName, member.CreatedAt, member.UpdatedAt); err != nil {
		return nil, nil, fmt.Errorf("failed to create account owner: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
		VALUES ($1, 'free', 'active', NOW(), NOW() + INTERVAL '1 month')
		ON CONFLICT (user_id) DO NOTHING
	`, user.ID); err != nil {
		return nil, nil, fmt.Errorf("failed to create free subscription: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return user, member, nil
}

func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, name, COALESCE(status, 'active'), deleted_at, created_at, updated_at
		FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL
	`, strings.TrimSpace(email)).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Name, &user.Status, &user.DeletedAt, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *Repository) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, name, COALESCE(status, 'active'), deleted_at, created_at, updated_at
		FROM users WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Name, &user.Status, &user.DeletedAt, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *Repository) GetMemberByEmailWithAccount(ctx context.Context, email string) (*models.UserMember, *models.User, error) {
	var member models.UserMember
	var account models.User
	err := r.db.QueryRow(ctx, `
		SELECT
			um.id, um.user_id, um.email, COALESCE(um.password_hash, ''), COALESCE(um.full_name, ''),
			um.role, um.status, um.last_login_at, um.email_verified_at, um.created_at, um.updated_at,
			u.id, u.email, u.password_hash, u.name, COALESCE(u.status, 'active'), u.deleted_at, u.created_at, u.updated_at
		FROM users_members um
		INNER JOIN users u ON u.id = um.user_id
		WHERE LOWER(um.email) = LOWER($1)
		  AND u.deleted_at IS NULL
	`, strings.TrimSpace(email)).Scan(
		&member.ID, &member.UserID, &member.Email, &member.PasswordHash, &member.FullName,
		&member.Role, &member.Status, &member.LastLoginAt, &member.EmailVerifiedAt, &member.CreatedAt, &member.UpdatedAt,
		&account.ID, &account.Email, &account.PasswordHash, &account.Name, &account.Status, &account.DeletedAt, &account.CreatedAt, &account.UpdatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	return &member, &account, nil
}

func (r *Repository) GetMemberByIDWithAccount(ctx context.Context, memberID string) (*models.UserMember, *models.User, error) {
	var member models.UserMember
	var account models.User
	err := r.db.QueryRow(ctx, `
		SELECT
			um.id, um.user_id, um.email, COALESCE(um.password_hash, ''), COALESCE(um.full_name, ''),
			um.role, um.status, um.last_login_at, um.email_verified_at, um.created_at, um.updated_at,
			u.id, u.email, u.password_hash, u.name, COALESCE(u.status, 'active'), u.deleted_at, u.created_at, u.updated_at
		FROM users_members um
		INNER JOIN users u ON u.id = um.user_id
		WHERE um.id = $1
		  AND u.deleted_at IS NULL
	`, memberID).Scan(
		&member.ID, &member.UserID, &member.Email, &member.PasswordHash, &member.FullName,
		&member.Role, &member.Status, &member.LastLoginAt, &member.EmailVerifiedAt, &member.CreatedAt, &member.UpdatedAt,
		&account.ID, &account.Email, &account.PasswordHash, &account.Name, &account.Status, &account.DeletedAt, &account.CreatedAt, &account.UpdatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	return &member, &account, nil
}

func (r *Repository) UpdateUser(ctx context.Context, id, name string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(ctx, `
		UPDATE users
		SET name = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, email, password_hash, name, COALESCE(status, 'active'), deleted_at, created_at, updated_at
	`, id, name).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Name, &user.Status, &user.DeletedAt, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *Repository) UpdateMemberProfile(ctx context.Context, memberID, fullName string) (*models.UserMember, error) {
	var member models.UserMember
	err := r.db.QueryRow(ctx, `
		UPDATE users_members
		SET full_name = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, user_id, email, COALESCE(password_hash, ''), COALESCE(full_name, ''), role, status, last_login_at, email_verified_at, created_at, updated_at
	`, memberID, fullName).Scan(
		&member.ID, &member.UserID, &member.Email, &member.PasswordHash, &member.FullName,
		&member.Role, &member.Status, &member.LastLoginAt, &member.EmailVerifiedAt, &member.CreatedAt, &member.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &member, nil
}

func (r *Repository) CreateEmailActivationToken(ctx context.Context, memberID, token string, expiresAt time.Time) error {
	hash := hashActivationToken(token)
	_, err := r.db.Exec(ctx, `
		INSERT INTO email_activation_tokens (member_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`, memberID, hash, expiresAt)
	return err
}

func (r *Repository) ActivateMemberByToken(ctx context.Context, token string) (*models.UserMember, *models.User, error) {
	hash := hashActivationToken(token)
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)

	var memberID string
	if err := tx.QueryRow(ctx, `
		UPDATE email_activation_tokens
		SET used_at = NOW()
		WHERE token_hash = $1
		  AND used_at IS NULL
		  AND expires_at > NOW()
		RETURNING member_id
	`, hash).Scan(&memberID); err != nil {
		return nil, nil, err
	}

	var member models.UserMember
	var account models.User
	if err := tx.QueryRow(ctx, `
		UPDATE users_members um
		SET status = 'active',
			email_verified_at = COALESCE(email_verified_at, NOW()),
			updated_at = NOW()
		FROM users u
		WHERE um.id = $1
		  AND u.id = um.user_id
		  AND u.deleted_at IS NULL
		RETURNING
			um.id, um.user_id, um.email, COALESCE(um.password_hash, ''), COALESCE(um.full_name, ''),
			um.role, um.status, um.last_login_at, um.email_verified_at, um.created_at, um.updated_at,
			u.id, u.email, u.password_hash, u.name, COALESCE(u.status, 'active'), u.deleted_at, u.created_at, u.updated_at
	`, memberID).Scan(
		&member.ID, &member.UserID, &member.Email, &member.PasswordHash, &member.FullName,
		&member.Role, &member.Status, &member.LastLoginAt, &member.EmailVerifiedAt, &member.CreatedAt, &member.UpdatedAt,
		&account.ID, &account.Email, &account.PasswordHash, &account.Name, &account.Status, &account.DeletedAt, &account.CreatedAt, &account.UpdatedAt,
	); err != nil {
		return nil, nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return &member, &account, nil
}

func (r *Repository) DeleteAccount(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	return err
}

func hashActivationToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (r *Repository) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1
	`, id, passwordHash)
	return err
}

func (r *Repository) UpdateMemberPassword(ctx context.Context, memberID, passwordHash string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users_members
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1
	`, memberID, passwordHash)
	return err
}
