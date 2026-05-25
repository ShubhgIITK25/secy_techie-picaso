package main

import (
	"log"

	"github.com/gin-gonic/gin"

	"server/core/auth"
	"server/core/db"
	redisCore "server/core/redis"
	"server/core/rooms"
)

func main() {
	_ = db.LoadEnvFile(".env")

	if err := db.Dbconnect(); err != nil {
		log.Fatalf("db connect failed: %v", err)
	}
	defer db.Close()

	if err := db.EnsureTables(); err != nil {
		log.Fatalf("schema init failed: %v", err)
	}

	// Redis hook (placeholder): ready for future session/cache/rate-limit use.
	if err := redisCore.Init(); err != nil {
		log.Printf("redis init warning: %v", err)
	}
	defer redisCore.Close()

	r := gin.Default()
	auth.Router(r)
	rooms.Router(r)

	if err := r.Run(":18081"); err != nil {
		log.Fatalf("server failed: %v", err)
	}

}
