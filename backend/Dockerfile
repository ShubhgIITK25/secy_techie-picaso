FROM golang:1.25.6-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG MAIN_PACKAGE=./server1
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ${MAIN_PACKAGE}

FROM alpine:3.21

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=builder /out/server /usr/local/bin/server

EXPOSE 18080 18081

CMD ["server"]