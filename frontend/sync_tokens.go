package main

import (
	"encoding/json"
	"net/http"
)

// handleSyncTokens returns active subscriptions as JSON array for Node.js to fast-sync
func handleSyncTokens(w http.ResponseWriter, r *http.Request) {
	var subscriptions []Subscription
	// Only active subscriptions
	db.Where("active = ?", true).Find(&subscriptions)

	var result []map[string]interface{}

	for _, sub := range subscriptions {
		result = append(result, map[string]interface{}{
			"token":     sub.Token,
			"udid":      sub.DeviceUDID,
			"expiresAt": sub.ExpiresAt.UnixMilli(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
