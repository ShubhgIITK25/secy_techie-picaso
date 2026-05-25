package rooms

import (
	"errors"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"server/core/db"
)

type Room struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	RoomID           string    `gorm:"size:128;uniqueIndex;not null" json:"roomId"`
	OwnerClientID    string    `gorm:"size:128;not null;default:''" json:"ownerClientId"`
	OwnerDisplayName string    `gorm:"size:255;not null;default:''" json:"ownerDisplayName"`
	Occupancy        int       `gorm:"not null;default:0" json:"occupancy"`
	Capacity         int       `gorm:"not null;default:4" json:"capacity"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type RoomMember struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	RoomID      string    `gorm:"size:128;not null;index:idx_room_client,unique" json:"roomId"`
	ClientID    string    `gorm:"size:128;not null;index:idx_room_client,unique" json:"clientId"`
	DisplayName string    `gorm:"size:255;not null;default:''" json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type joinRequest struct {
	RoomID      string `json:"roomId" binding:"required"`
	ClientID    string `json:"clientId" binding:"required"`
	DisplayName string `json:"displayName"`
}

type leaveRequest struct {
	RoomID   string `json:"roomId" binding:"required"`
	ClientID string `json:"clientId" binding:"required"`
}

type kickRequest struct {
	RoomID            string `json:"roomId" binding:"required"`
	RequesterClientID string `json:"requesterClientId" binding:"required"`
	TargetClientID    string `json:"targetClientId" binding:"required"`
}

type roomMemberResponse struct {
	ClientID    string    `json:"clientId"`
	DisplayName string    `json:"displayName"`
	IsOwner     bool      `json:"isOwner"`
	CreatedAt   time.Time `json:"createdAt"`
}

type roomDetailResponse struct {
	RoomID           string               `json:"roomId"`
	OwnerClientID    string               `json:"ownerClientId"`
	OwnerDisplayName string               `json:"ownerDisplayName"`
	Occupancy        int                  `json:"occupancy"`
	Capacity         int                  `json:"capacity"`
	IsOwner          bool                 `json:"isOwner"`
	Members          []roomMemberResponse `json:"members"`
}

func JoinRoom(c *gin.Context) {
	if db.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "database not connected"})
		return
	}

	var req joinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid join payload"})
		return
	}

	if req.DisplayName == "" {
		req.DisplayName = req.ClientID
	}

	tx := db.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to join room"})
		return
	}

	var room Room
	roomErr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("room_id = ?", req.RoomID).First(&room).Error
	if errors.Is(roomErr, gorm.ErrRecordNotFound) {
		room = Room{
			RoomID:           req.RoomID,
			OwnerClientID:    req.ClientID,
			OwnerDisplayName: req.DisplayName,
			Capacity:         4,
			Occupancy:        0,
		}
		if err := tx.Create(&room).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to join room"})
			return
		}
	} else if roomErr != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load room"})
		return
	}

	if room.OwnerClientID == "" {
		room.OwnerClientID = req.ClientID
		room.OwnerDisplayName = req.DisplayName
		if err := tx.Save(&room).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to set room owner"})
			return
		}
	}

	if room.Capacity <= 0 {
		room.Capacity = 4
		if err := tx.Model(&Room{}).Where("room_id = ?", req.RoomID).Update("capacity", room.Capacity).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to normalize room capacity"})
			return
		}
	}

	var member RoomMember
	memberErr := tx.Where("room_id = ? AND client_id = ?", req.RoomID, req.ClientID).First(&member).Error
	if memberErr == nil {
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to join room"})
			return
		}
		c.JSON(http.StatusOK, buildRoomDetail(room, nil, req.ClientID))
		return
	}
	if !errors.Is(memberErr, gorm.ErrRecordNotFound) {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to check room member"})
		return
	}

	var actualOccupancy int64
	if err := tx.Model(&RoomMember{}).Where("room_id = ?", req.RoomID).Count(&actualOccupancy).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to count room members"})
		return
	}

	if room.Occupancy != int(actualOccupancy) {
		room.Occupancy = int(actualOccupancy)
		if err := tx.Model(&Room{}).Where("room_id = ?", req.RoomID).Update("occupancy", room.Occupancy).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to normalize room occupancy"})
			return
		}
	}

	if int(actualOccupancy) >= room.Capacity {
		tx.Rollback()
		c.JSON(http.StatusConflict, gin.H{"message": "room is full"})
		return
	}

	member = RoomMember{RoomID: req.RoomID, ClientID: req.ClientID, DisplayName: req.DisplayName}
	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to add room member"})
		return
	}

	nextOccupancy := int(actualOccupancy) + 1
	if err := tx.Model(&Room{}).Where("room_id = ?", req.RoomID).Update("occupancy", nextOccupancy).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update room occupancy"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to join room"})
		return
	}

	room.Occupancy = nextOccupancy
	c.JSON(http.StatusOK, buildRoomDetail(room, []RoomMember{member}, req.ClientID))
}

func LeaveRoom(c *gin.Context) {
	if db.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "database not connected"})
		return
	}

	var req leaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid leave payload"})
		return
	}

	tx := db.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to leave room"})
		return
	}

	var room Room
	if err := tx.Where("room_id = ?", req.RoomID).First(&room).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"message": "room not found"})
		return
	}

	result := tx.Where("room_id = ? AND client_id = ?", req.RoomID, req.ClientID).Delete(&RoomMember{})
	if result.Error != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to leave room"})
		return
	}

	if result.RowsAffected > 0 && room.Occupancy > 0 {
		if err := tx.Model(&Room{}).Where("room_id = ?", req.RoomID).Update("occupancy", gorm.Expr("GREATEST(occupancy - 1, 0)")).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update room occupancy"})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to leave room"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "left room"})
}

func RoomDetails(c *gin.Context) {
	if db.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "database not connected"})
		return
	}

	roomID := c.Param("roomID")
	clientID := c.Query("clientId")
	if roomID == "" || clientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "missing room or client id"})
		return
	}

	var room Room
	if err := db.DB.Where("room_id = ?", roomID).First(&room).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "room not found"})
		return
	}

	var members []RoomMember
	if err := db.DB.Where("room_id = ?", roomID).Find(&members).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load room members"})
		return
	}

	if clientID != room.OwnerClientID {
		allowed := false
		for _, member := range members {
			if member.ClientID == clientID {
				allowed = true
				break
			}
		}
		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"message": "not a member of this room"})
			return
		}
	}

	c.JSON(http.StatusOK, buildRoomDetail(room, members, clientID))
}

func KickMember(c *gin.Context) {
	if db.DB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "database not connected"})
		return
	}

	var req kickRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid kick payload"})
		return
	}

	var room Room
	if err := db.DB.Where("room_id = ?", req.RoomID).First(&room).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "room not found"})
		return
	}

	if req.RequesterClientID != room.OwnerClientID {
		c.JSON(http.StatusForbidden, gin.H{"message": "only room owner can kick users"})
		return
	}

	if req.TargetClientID == room.OwnerClientID {
		c.JSON(http.StatusBadRequest, gin.H{"message": "owner cannot be kicked"})
		return
	}

	tx := db.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to kick member"})
		return
	}

	var member RoomMember
	if err := tx.Where("room_id = ? AND client_id = ?", req.RoomID, req.TargetClientID).First(&member).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"message": "member not found"})
		return
	}

	if err := tx.Where("room_id = ? AND client_id = ?", req.RoomID, req.TargetClientID).Delete(&RoomMember{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to kick member"})
		return
	}

	if room.Occupancy > 0 {
		if err := tx.Model(&Room{}).Where("room_id = ?", req.RoomID).Update("occupancy", gorm.Expr("GREATEST(occupancy - 1, 0)")).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update room occupancy"})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to kick member"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "member kicked"})
}

func buildRoomDetail(room Room, members []RoomMember, requesterClientID string) gin.H {
	if members == nil {
		members = []RoomMember{}
	}

	memberResponses := make([]roomMemberResponse, 0, len(members))
	for _, member := range members {
		memberResponses = append(memberResponses, roomMemberResponse{
			ClientID:    member.ClientID,
			DisplayName: member.DisplayName,
			IsOwner:     member.ClientID == room.OwnerClientID,
			CreatedAt:   member.CreatedAt,
		})
	}

	sort.SliceStable(memberResponses, func(i, j int) bool {
		if memberResponses[i].IsOwner != memberResponses[j].IsOwner {
			return memberResponses[i].IsOwner
		}
		return memberResponses[i].CreatedAt.Before(memberResponses[j].CreatedAt)
	})

	return gin.H{
		"roomId":           room.RoomID,
		"ownerClientId":    room.OwnerClientID,
		"ownerDisplayName": room.OwnerDisplayName,
		"occupancy":        room.Occupancy,
		"capacity":         room.Capacity,
		"isOwner":          requesterClientID == room.OwnerClientID,
		"members":          memberResponses,
	}
}
