package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"server/core/db"
	redisCore "server/core/redis"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"size:100;not null" json:"username"`
	Email        string    `gorm:"size:255;not null;index:idx_user_email,unique" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	IsVerified   bool      `gorm:"not null;default:false" json:"isVerified"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type signupRequest struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type verifyRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required"`
}

func Signup(c *gin.Context) {
	if db.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "database not connected"})
		return
	}

	var req signupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid signup payload"})
		return
	}

	var user User
	findErr := db.DB.Where("email = ?", req.Email).First(&user).Error
	if findErr == nil && user.IsVerified {
		c.JSON(http.StatusConflict, gin.H{"message": "email already registered"})
		return
	}
	if findErr != nil && !errors.Is(findErr, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to check user"})
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to secure password"})
		return
	}

	if errors.Is(findErr, gorm.ErrRecordNotFound) {
		user = User{
			Username:     req.Username,
			Email:        req.Email,
			PasswordHash: string(passwordHash),
			IsVerified:   false,
		}
		if err := db.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create user"})
			return
		}
	} else {
		user.Username = req.Username
		user.PasswordHash = string(passwordHash)
		user.IsVerified = false
		if err := db.DB.Save(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update user"})
			return
		}
	}

	code, err := generateOTP()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to generate otp"})
		return
	}

	if err := redisCore.StoreOTP(context.Background(), req.Email, code, 10*time.Minute); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to save otp"})
		return
	}

	if err := sendOTPEmail(req.Email, code); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "otp sent successfully",
		"email":   req.Email,
	})
}

func Login(c *gin.Context) {
	if db.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "database not connected"})
		return
	}

	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid login payload"})
		return
	}

	var user User
	if err := db.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "invalid credentials"})
		return
	}

	if !user.IsVerified {
		c.JSON(http.StatusForbidden, gin.H{"message": "email not verified"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "invalid credentials"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "login successful",
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

func VerifyEmail(c *gin.Context) {
	if db.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "database not connected"})
		return
	}

	var req verifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid verification payload"})
		return
	}

	code, err := redisCore.GetOTP(context.Background(), req.Email)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid or expired otp"})
		return
	}

	if code != req.Code {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid verification code"})
		return
	}

	var user User
	if err := db.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		return
	}

	user.IsVerified = true
	if err := db.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to verify user"})
		return
	}

	_ = redisCore.DeleteOTP(context.Background(), req.Email)

	c.JSON(http.StatusOK, gin.H{
		"message": "email verified successfully",
	})
}

func generateOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func sendOTPEmail(toEmail, otp string) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_EMAIL")
	if user == "" {
		user = os.Getenv("SMTP_USER")
	}
	pass := os.Getenv("SMTP_APP_PASSWORD")
	if pass == "" {
		pass = os.Getenv("SMTP_PASS")
	}
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = user
	}

	if strings.TrimSpace(host) == "" || strings.TrimSpace(port) == "" || strings.TrimSpace(user) == "" || strings.TrimSpace(pass) == "" {
		log.Printf("OTP for %s: %s", toEmail, otp)
		return nil
	}

	auth := smtp.PlainAuth("", user, pass, host)
	msg := strings.Builder{}
	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", toEmail))
	msg.WriteString("Subject: Your verification code\r\n")
	msg.WriteString("MIME-version: 1.0;\r\n")
	msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\";\r\n\r\n")
	msg.WriteString(fmt.Sprintf("Your verification code is: %s\r\n\r\n", otp))
	msg.WriteString("This code expires in 10 minutes.")

	addr := host + ":" + port
	return smtp.SendMail(addr, auth, from, []string{toEmail}, []byte(msg.String()))
}
