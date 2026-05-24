package redis

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	redislib "github.com/redis/go-redis/v9"
)

var Client *redislib.Client

const otpKeyPrefix = "otp:email:"

func Init() error {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	password := os.Getenv("REDIS_PASSWORD")
	dbIndex := 0
	if value := strings.TrimSpace(os.Getenv("REDIS_DB")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return fmt.Errorf("invalid redis db: %w", err)
		}
		dbIndex = parsed
	}

	Client = redislib.NewClient(&redislib.Options{
		Addr:     addr,
		Password: password,
		DB:       dbIndex,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := Client.Ping(ctx).Err(); err != nil {
		_ = Client.Close()
		Client = nil
		return err
	}

	log.Println("redis connected")
	return nil
}

func Close() {
	if Client == nil {
		return
	}
	_ = Client.Close()
	Client = nil
}

func StoreOTP(ctx context.Context, email, code string, ttl time.Duration) error {
	if Client == nil {
		return errors.New("redis not connected")
	}
	return Client.Set(ctx, otpKey(email), code, ttl).Err()
}

func GetOTP(ctx context.Context, email string) (string, error) {
	if Client == nil {
		return "", errors.New("redis not connected")
	}
	return Client.Get(ctx, otpKey(email)).Result()
}

func DeleteOTP(ctx context.Context, email string) error {
	if Client == nil {
		return errors.New("redis not connected")
	}
	return Client.Del(ctx, otpKey(email)).Err()
}

func otpKey(email string) string {
	return otpKeyPrefix + strings.ToLower(strings.TrimSpace(email))
}
