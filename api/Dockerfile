# Build stage
FROM alpine:3.21 AS builder

WORKDIR /app

RUN apk add --no-cache go git make

ENV GOTOOLCHAIN=local
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /api ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /worker ./cmd/worker
RUN CGO_ENABLED=0 GOOS=linux go build -o /migrate ./cmd/migrate
RUN CGO_ENABLED=0 GOOS=linux go build -o /platform-admin-bootstrap ./cmd/platform-admin-bootstrap

# API image
FROM golang:1.21-alpine AS api

WORKDIR /app

ENV ZONEINFO=/usr/local/go/lib/time/zoneinfo.zip

COPY --from=builder /api .
COPY --from=builder /platform-admin-bootstrap .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/migrations_postgres ./migrations_postgres

EXPOSE 8080

ENV GIN_MODE=release

CMD ["./api"]

# Worker image
FROM golang:1.21-alpine AS worker

WORKDIR /app

ENV ZONEINFO=/usr/local/go/lib/time/zoneinfo.zip

COPY --from=builder /worker .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/migrations_postgres ./migrations_postgres

CMD ["./worker"]

# Migrate image
FROM alpine:3.21 AS migrate

RUN apk add --no-cache ca-certificates postgresql-client

WORKDIR /app

COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/migrations_postgres ./migrations_postgres
COPY --from=builder /migrate .

CMD ["./migrate"]
