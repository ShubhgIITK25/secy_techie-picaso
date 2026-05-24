package auth

import "github.com/gin-gonic/gin"

func Router(r *gin.Engine) {
	auth := r.Group("/api/auth")
	auth.POST("/login", Login)
	auth.POST("/signup", Signup)
	auth.POST("/verify-email", VerifyEmail)
}
