package helpdesk

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type HelpdeskService struct {
	// pg driver.Conn would be injected
}

type Ticket struct {
	ID          string     `json:"id"`
	SiteID      string     `json:"site_id"`
	UserID      string     `json:"user_id"`
	Subject     string     `json:"subject"`
	Description string     `json:"description"`
	Status      string     `json:"status"` // open, pending, resolved, closed
	Priority    string     `json:"priority"` // low, medium, high, urgent
	AssignedTo  string     `json:"assigned_to"`
	Messages    []Message  `json:"messages"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type Message struct {
	ID        string    `json:"id"`
	TicketID  string    `json:"ticket_id"`
	SenderID  string    `json:"sender_id"`
	SenderType string   `json:"sender_type"` // user, support
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateTicket creates a new support ticket
func (s *HelpdeskService) CreateTicket(ctx context.Context, req CreateTicketRequest) (*Ticket, error) {
	ticket := &Ticket{
		ID:          uuid.New().String(),
		SiteID:      req.SiteID,
		UserID:      req.UserID,
		Subject:     req.Subject,
		Description: req.Description,
		Status:      "open",
		Priority:    req.Priority,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Insert into PostgreSQL
	return ticket, nil
}

type CreateTicketRequest struct {
	SiteID      string `json:"site_id"`
	UserID      string `json:"user_id"`
	Subject     string `json:"subject"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
}

// GetTickets returns all tickets for a user
func (s *HelpdeskService) GetTickets(ctx context.Context, userID string) ([]Ticket, error) {
	return []Ticket{}, nil // Would query PostgreSQL
}

// GetTicket returns a single ticket with messages
func (s *HelpdeskService) GetTicket(ctx context.Context, ticketID string) (*Ticket, error) {
	return &Ticket{ID: ticketID}, nil // Would query PostgreSQL
}

// AddMessage adds a message to a ticket
func (s *HelpdeskService) AddMessage(ctx context.Context, ticketID, senderID, senderType, content string) (*Message, error) {
	message := &Message{
		ID:         uuid.New().String(),
		TicketID:   ticketID,
		SenderID:   senderID,
		SenderType: senderType,
		Content:    content,
		CreatedAt:  time.Now(),
	}

	// Update ticket UpdatedAt and potentially auto-respond
	
	return message, nil
}

// UpdateStatus updates ticket status
func (s *HelpdeskService) UpdateStatus(ctx context.Context, ticketID, status, assignedTo string) error {
	return nil // Would update PostgreSQL
}

// EmailService handles outbound emails
type EmailService struct {
	// email provider would be injected (SendGrid, SES, etc.)
}

func (e *EmailService) SendTicketConfirmation(ticket *Ticket) error {
	// Send email to user confirming ticket creation
	return nil
}

func (e *EmailService) SendTicketUpdate(ticket *Ticket, message *Message) error {
	// Send email to user about new message
	return nil
}

func (e *EmailService) SendTicketResolved(ticket *Ticket) error {
	// Send email when ticket is resolved
	return nil
}