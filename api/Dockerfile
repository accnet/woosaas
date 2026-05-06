# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git make

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /api ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /worker ./cmd/worker
RUN CGO_ENABLED=0 GOOS=linux go build -o /migrate ./cmd/migrate

# API image
FROM alpine:3.19 AS api

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /api .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/migrations_postgres ./migrations_postgres

EXPOSE 8080

ENV GIN_MODE=release

CMD ["./api"]

# Worker image
FROM alpine:3.19 AS worker

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /worker .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/migrations_postgres ./migrations_postgres

CMD ["./worker"]

# Migrate image
FROM alpine:3.19 AS migrate

RUN apk add --no-cache ca-certificates postgresql-client

WORKDIR /app

COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/migrations_postgres ./migrations_postgres
COPY --from=builder /migrate .

CMD ["./migrate"]
