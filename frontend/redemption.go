package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// RedemptionCode represents a redemption code in the database
type RedemptionCode struct {
	gorm.Model
	Code      string `gorm:"uniqueIndex"`
	Tier      string // ram4gb, ram6gb, ram8gb
	Duration  string // 7h (7 hours), could be extended to days/months
	Used      bool   `gorm:"default:false"`
	UsedBy    uint   // UserID who used it
	UsedAt    *time.Time
	ExpiresAt time.Time
	Type      string // "new" or "extend"
}

// GenerateRedemptionCode generates a random redemption code
func GenerateRedemptionCode() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return strings.ToUpper(hex.EncodeToString(bytes))
}

// API: Generate redemption code
// Usage: curl -X POST http://localhost:8000/api/redemption/generate -d '{"tier":"ram4gb","duration":"7h","type":"new"}'
func handleGenerateRedemptionCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Tier     string `json:"tier"`     // ram4gb, ram6gb, ram8gb
		Duration string `json:"duration"` // 7h, 24h, etc
		Type     string `json:"type"`     // "new" or "extend"
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Validate tier
	validTiers := map[string]bool{"ram4gb": true, "ram6gb": true, "ram8gb": true}
	if !validTiers[req.Tier] {
		http.Error(w, "Invalid tier. Use: ram4gb, ram6gb, ram8gb", http.StatusBadRequest)
		return
	}

	// Validate type
	if req.Type != "new" && req.Type != "extend" {
		req.Type = "new" // default
	}

	// Generate unique code
	var code string
	for {
		code = GenerateRedemptionCode()
		var existing RedemptionCode
		err := db.Where("code = ?", code).First(&existing).Error
		if err == gorm.ErrRecordNotFound {
			break
		}
	}

	// Create redemption code with 30 days expiry
	redemption := RedemptionCode{
		Code:      code,
		Tier:      req.Tier,
		Duration:  req.Duration,
		Used:      false,
		ExpiresAt: time.Now().Add(30 * 24 * time.Hour),
		Type:      req.Type,
	}

	if err := db.Create(&redemption).Error; err != nil {
		http.Error(w, "Failed to create redemption code", http.StatusInternalServerError)
		return
	}

	// Check available devices from ws-scrcpy
	availableDevices := 0
	resp, err := http.Get(NodeBackendURL + "/api/devices-available")
	if err == nil {
		defer resp.Body.Close()
		var devicesResp struct {
			Available int `json:"available"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&devicesResp); err == nil {
			availableDevices = devicesResp.Available
		}
	}

	log.Printf("[Redemption] Generated code: %s for tier: %s, duration: %s, type: %s | Available devices: %d",
		code, req.Tier, req.Duration, req.Type, availableDevices)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":          true,
		"code":             code,
		"tier":             req.Tier,
		"duration":         req.Duration,
		"type":             req.Type,
		"expires":          redemption.ExpiresAt,
		"availableDevices": availableDevices,
		"note":             "Device will be allocated when code is redeemed, not when generated",
	})
}

// Helper function to allocate device using ws-scrcpy backend
func allocateDeviceForUser(userID uint, tier string, duration time.Duration) (*Subscription, error) {
	// Map tier to RAM size
	ramSize := 4 // default
	if tier == "ram6gb" {
		ramSize = 6
	} else if tier == "ram8gb" {
		ramSize = 8
	} else if tier == "ram4gb" {
		ramSize = 4
	}

	// Convert duration to minutes
	durationMinutes := int(duration.Minutes())

	// Call ws-scrcpy backend to allocate device
	requestBody, _ := json.Marshal(map[string]int{
		"duration": durationMinutes,
		"ram":      ramSize,
	})

	resp, err := http.Post(NodeBackendURL+"/api/allocate", "application/json", bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to call allocation backend: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("no devices available")
	}

	var result struct {
		Success   bool   `json:"success"`
		Token     string `json:"token"`
		Udid      string `json:"udid"`
		Url       string `json:"url"`
		ExpiresAt int64  `json:"expiresAt"` // ms
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("invalid allocation response: %w", err)
	}

	// IMPORTANT: Override ExpiresAt with actual redemption duration
	// Node.js backend may return different (shorter) expiry
	expiresAt := time.Now().Add(duration)

	log.Printf("[Redemption] Device allocated. Node.js expiry would be: %v, but using redemption duration: %v",
		time.Unix(0, result.ExpiresAt*int64(time.Millisecond)), expiresAt)

	// Create subscription
	sub := Subscription{
		UserID:     userID,
		DeviceUDID: result.Udid,
		Token:      result.Token,
		StreamURL:  result.Url,
		ExpiresAt:  expiresAt, // Use redemption code duration
		Active:     true,
	}

	if err := db.Create(&sub).Error; err != nil {
		return nil, fmt.Errorf("failed to create subscription: %w", err)
	}

	return &sub, nil
}

// API: Redeem code for new device
func handleRedeemCodeNew(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user from session (authMiddleware already verified they're logged in)
	session, _ := store.Get(r, "session-name")

	// Debug: log all session values
	log.Printf("[Redemption] Session values: %+v", session.Values)

	userEmail, _ := session.Values["email"].(string)
	log.Printf("[Redemption] Email from session: '%s' (empty: %v)", userEmail, userEmail == "")

	var user User
	// Prioritize user_id from session as it is more stable
	userID, userIDOk := session.Values["user_id"].(uint)

	// Try finding by ID first if available
	if userIDOk {
		if err := db.First(&user, userID).Error; err == nil {
			goto success
		}
	}

	// Fallback to email lookup
	if userEmail != "" {
		if err := db.Where("email = ?", userEmail).First(&user).Error; err == nil {
			goto success
		}
	}

	// If User lookup failed
	log.Printf("[Redemption] User lookup failed. Email: '%s', ID: %d", userEmail, userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"message": "User not found in database. Please logout and login again.",
	})
	return

success:
	log.Printf("[Redemption] User %s (ID: %d) attempting redemption", user.Email, user.ID)

	var req struct {
		Code string `json:"code"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))

	// Find redemption code
	var redemption RedemptionCode
	if err := db.Where("code = ?", req.Code).First(&redemption).Error; err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Kode penukaran tidak valid atau tidak ditemukan",
		})
		return
	}

	// Check if already used
	if redemption.Used {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Kode penukaran sudah digunakan",
		})
		return
	}

	// Check if expired
	if time.Now().After(redemption.ExpiresAt) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Kode penukaran sudah kadaluarsa",
		})
		return
	}

	// Check type
	if redemption.Type != "new" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Kode ini hanya untuk perpanjangan, bukan ponsel baru",
		})
		return
	}

	// Parse duration (e.g., "7h" = 7 hours)
	duration, err := parseDuration(redemption.Duration)
	if err != nil {
		duration = 7 * time.Hour // default 7 hours
	}

	// Allocate device
	allocation, err := allocateDeviceForUser(user.ID, redemption.Tier, duration)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Gagal mengalokasikan perangkat: " + err.Error(),
		})
		return
	}

	// Mark code as used
	now := time.Now()
	redemption.Used = true
	redemption.UsedBy = user.ID
	redemption.UsedAt = &now
	db.Save(&redemption)

	log.Printf("[Redemption] User %s redeemed code %s for new device", user.Email, req.Code)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   "Kode penukaran berhasil! Ponsel Cloud baru telah ditambahkan",
		"device":    allocation.DeviceUDID,
		"streamUrl": allocation.StreamURL,
		"expiresAt": allocation.ExpiresAt,
	})
}

// API: Redeem code to extend existing device
func handleRedeemCodeExtend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user from session (authMiddleware already verified they're logged in)
	session, _ := store.Get(r, "session-name")
	userEmail, _ := session.Values["email"].(string)

	var user User
	// Prioritize user_id from session as it is more stable
	userID, userIDOk := session.Values["user_id"].(uint)

	// Try finding by ID first if available
	if userIDOk {
		if err := db.First(&user, userID).Error; err == nil {
			goto userFound
		}
	}

	// Fallback to email lookup
	if userEmail != "" {
		if err := db.Where("email = ?", userEmail).First(&user).Error; err == nil {
			goto userFound
		}
	}

	// If we get here, user not found
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"message": "User not found in database. Please logout and login again.",
	})
	return

userFound:

	log.Printf("[Redemption] User %s (ID: %d) attempting extension", user.Email, user.ID)

	var req struct {
		Code       string `json:"code"`
		DeviceUDID string `json:"device_udid"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	req.DeviceUDID = strings.TrimSpace(req.DeviceUDID)

	// Find redemption code
	var redemption RedemptionCode
	if err := db.Where("code = ?", req.Code).First(&redemption).Error; err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Kode penukaran tidak valid atau tidak ditemukan",
		})
		return
	}

	// Check if already used
	if redemption.Used {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Kode penukaran sudah digunakan",
		})
		return
	}

	// Check if expired
	if time.Now().After(redemption.ExpiresAt) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Kode penukaran sudah kadaluarsa",
		})
		return
	}

	// Find user's subscription (Robust lookup)
	// Fetch ALL devices for user first, then match in Go to handle potential whitespace/invisible chars in DB
	var activeSubs []Subscription
	db.Where("user_id = ?", user.ID).Find(&activeSubs)

	var foundSub *Subscription
	var availableDevices []string

	// Helper to remove everything except letters and numbers
	sanitize := func(s string) string {
		var result strings.Builder
		for _, r := range s {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
				result.WriteRune(r)
			}
		}
		return strings.ToUpper(result.String())
	}

	targetClean := sanitize(req.DeviceUDID)

	log.Printf("[Redemption] Looking for device. Input: '%s' -> Clean: '%s'", req.DeviceUDID, targetClean)

	for i := range activeSubs {
		sub := &activeSubs[i]
		dbClean := sanitize(sub.DeviceUDID)
		availableDevices = append(availableDevices, fmt.Sprintf("%s (raw)", sub.DeviceUDID))

		// Check match
		if dbClean == targetClean {
			foundSub = sub
			log.Printf("[Redemption] Match found! DB: '%s' -> Clean: '%s'", sub.DeviceUDID, dbClean)
			break
		} else {
			log.Printf("[Redemption] Mismatch. DB: '%s' -> Clean: '%s'", sub.DeviceUDID, dbClean)
		}
	}

	if foundSub == nil {
		log.Printf("[Redemption] Device search failed. UserID: %d. TargetClean: %s", user.ID, targetClean)

		deviceListStr := "Anda tidak memiliki perangkat aktif."
		if len(availableDevices) > 0 {
			deviceListStr = strings.Join(availableDevices, ", ")
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Perangkat ID '%s' tidak ada. Perangkat Anda: [%s]. (System Cleaned: %s)", req.DeviceUDID, deviceListStr, targetClean),
		})
		return
	}

	// Parse duration
	duration, err := parseDuration(redemption.Duration)
	if err != nil {
		duration = 7 * time.Hour
	}

	// Extend subscription using pointer to ensure changes are saved
	newExpiresAt := foundSub.ExpiresAt.Add(duration)
	foundSub.ExpiresAt = newExpiresAt
	foundSub.Active = true

	// Update database
	if err := db.Save(foundSub).Error; err != nil {
		log.Printf("[Redemption] Failed to extend subscription: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Gagal menyimpan perpanjangan perangkat",
		})
		return
	}

	// Mark code as used
	now := time.Now()
	redemption.Used = true
	redemption.UsedBy = user.ID
	redemption.UsedAt = &now
	db.Save(&redemption)

	log.Printf("[Redemption] User %s extended device %s with code %s. New expiry: %v",
		user.Email, req.DeviceUDID, req.Code, newExpiresAt)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   fmt.Sprintf("Perangkat %s berhasil diperpanjang %s!", req.DeviceUDID, redemption.Duration),
		"expiresAt": newExpiresAt,
	})
}

// Parse duration string like "7h", "24h", "7d" into time.Duration
func parseDuration(durationStr string) (time.Duration, error) {
	durationStr = strings.ToLower(strings.TrimSpace(durationStr))

	// Simple parser for "7h", "24h", "7d"
	if strings.HasSuffix(durationStr, "h") {
		hoursStr := strings.TrimSuffix(durationStr, "h")
		hours, err := strconv.Atoi(hoursStr)
		if err != nil || hours < 0 {
			return 0, fmt.Errorf("invalid hours value")
		}

		// Limit maximum to 720 hours (30 days)
		if hours > 720 {
			log.Printf("[Redemption] Hours %d capped to 720", hours)
			hours = 720
		}

		return time.Duration(hours) * time.Hour, nil

	} else if strings.HasSuffix(durationStr, "d") {
		daysStr := strings.TrimSuffix(durationStr, "d")

		// Handle very large numbers safely
		days := 0
		if len(daysStr) > 6 {
			// If more than 6 digits, it's definitely > 100000, so cap it
			days = 100000
			log.Printf("[Redemption] Days string too large (%s), capped to 100000", daysStr)
		} else {
			parsedDays, err := strconv.Atoi(daysStr)
			if err != nil || parsedDays < 0 {
				return 0, fmt.Errorf("invalid days value")
			}
			days = parsedDays

			// Limit maximum to 100000 days (~274 years)
			if days > 100000 {
				log.Printf("[Redemption] Days %d capped to 100000", days)
				days = 100000
			}
		}

		duration := time.Duration(days) * 24 * time.Hour
		log.Printf("[Redemption] Parsed duration: %dd = %v", days, duration)
		return duration, nil
	}

	return 0, fmt.Errorf("invalid duration format")
}
