package rooms

import "github.com/gin-gonic/gin"

func Router(r *gin.Engine) {
	group := r.Group("/api/rooms")
	group.POST("/join", JoinRoom)
	group.POST("/leave", LeaveRoom)
	group.GET("/:roomID", RoomDetails)
	group.POST("/kick", KickMember)
}
