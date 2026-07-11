package main

import (
	"encoding/json"
	"log"
	"net/http"
)

// Debug endpoint to check session status
func handleCheckSession(w http.ResponseWriter, r *http.Request) {
	session, err := store.Get(r, "session-name")
	if err != nil {
		log.Printf("[Session Check] Error: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")

	response := map[string]interface{}{
		"sessionExists": session != nil,
		"sessionError":  err != nil,
	}

	if session != nil {
		email, emailOK := session.Values["email"].(string)
		userID, userIDOK := session.Values["user_id"].(uint)

		response["sessionValues"] = session.Values
		response["hasEmail"] = emailOK
		response["hasUserID"] = userIDOK

		if emailOK {
			response["email"] = email
		}
		if userIDOK {
			response["userID"] = userID
		}

		// Check if user exists in DB
		if emailOK && email != "" {
			var user User
			if err := db.Where("email = ?", email).First(&user).Error; err == nil {
				response["userFound"] = true
				response["userName"] = user.Name
				response["userNumericID"] = user.NumericID
			} else {
				response["userFound"] = false
				response["dbError"] = err.Error()
			}
		}
	}

	json.NewEncoder(w).Encode(response)
}
