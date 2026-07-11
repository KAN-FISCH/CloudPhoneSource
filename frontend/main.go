package main

import (
	"bytes"

	"encoding/gob"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/gorilla/sessions"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/google"
	"gorm.io/gorm"
)

// --- Configuration ---
const (
	SessionSecret = "your-secret-key-change-this-in-prod"
	DbName        = "webapp.db"

	// PAKASIR Credentials
	PakasirSlug    = "pt-nusantara-cloudphone"          // Slug from Dashboard
	PakasirApiKey  = "JWaDMBbzJsASS4ldM6vkCMBtobkZ1FI7" // API Key
	PakasirBaseURL = "https://app.pakasir.com"          // Base URL for Payment Page

	AdminFee = 500 // Admin Fee in IDR

	// Deployment Configuration
	AppBaseURL     = "http://localhost:8080"
	NodeBackendURL = "http://localhost:8000"
)

// --- Database Models ---
type User struct {
	gorm.Model
	Email     string `gorm:"uniqueIndex"`
	Name      string
	Provider  string
	SocialID  string
	NumericID string
}

type Transaction struct {
	gorm.Model
	UserID      uint
	OrderID     string
	Amount      int64
	Plan        string
	Status      string // pending, success, failed
	IsAllocated bool   // Track if device has been allocated
}

// Helper methods for template rendering
func (t *Transaction) IconClass() string {
	if t.Status == "success" {
		return "icon-green"
	}
	return "icon-orange"
}

func (t *Transaction) StatusClass() string {
	if t.Status == "success" {
		return "status-success"
	} else if t.Status == "pending" {
		return "status-pending"
	}
	return "status-failed"
}

func (t *Transaction) IconText() template.HTML {
	if t.Status == "success" {
		return template.HTML(`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`)
	}
	return template.HTML(`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`)
}

type Subscription struct {
	gorm.Model
	UserID     uint
	DeviceUDID string
	OrderID    string // Linked Transaction OrderID
	Token      string
	StreamURL  string
	ExpiresAt  time.Time
	Active     bool
}

func (s Subscription) DynamicStreamURL() string {
	// Construct WS URL
	wsBase := NodeBackendURL
	if strings.HasPrefix(wsBase, "https://") {
		wsBase = strings.Replace(wsBase, "https://", "wss://", 1)
	} else if strings.HasPrefix(wsBase, "http://") {
		wsBase = strings.Replace(wsBase, "http://", "ws://", 1)
	}

	wsUrl := fmt.Sprintf("%s/?action=proxy-adb&remote=tcp:8886&udid=%s&token=%s", wsBase, s.DeviceUDID, s.Token)
	encodedWsUrl := url.QueryEscape(wsUrl)

	// Add max_width=1024 to potentially fix black screen on resolution change
	return fmt.Sprintf("%s/#!action=stream&udid=%s&player=webrtc&ws=%s&token=%s&scrcpy_options=max_width=1024", NodeBackendURL, s.DeviceUDID, encodedWsUrl, s.Token)
}

func (s Subscription) ScreenshotURL() string {
	return fmt.Sprintf("%s/api/screenshot/%s?token=%s", NodeBackendURL, s.DeviceUDID, s.Token)
}

// --- Global Variables ---
var (
	db    *gorm.DB
	store *sessions.CookieStore
)

func loadEnv() {
	paths := []string{".env", "../.env"}
	for _, p := range paths {
		file, err := os.Open(p)
		if err != nil {
			continue
		}
		var buf bytes.Buffer
		_, _ = io.Copy(&buf, file)
		file.Close()
		lines := strings.Split(buf.String(), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.TrimSpace(parts[1])
				val = strings.Trim(val, `"' `)
				os.Setenv(key, val)
			}
		}
		break
	}
}

func main() {
	loadEnv()

	// 1. Initialize Database
	initDB()

	// Register types for session
	gob.Register(uint(0))

	store = sessions.NewCookieStore([]byte(SessionSecret))
	store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 days
		HttpOnly: true,
	}

	gothic.Store = store
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	googleClientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	goth.UseProviders(
		google.New(googleClientID, googleClientSecret, AppBaseURL+"/auth/google/callback"),
	)
	log.Println("Pakasir Payment Gateway Initialized.")

	// Start Background Cleanup Ticker
	startBackgroundCleanupTicker()

	// 5. Setup Static Files (NO CACHE)
	fileServer := http.FileServer(http.Dir("./static"))
	http.Handle("/static/", http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fileServer.ServeHTTP(w, r)
	})))

	// 6. Setup Routes
	// Public
	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/login", handleLogin)

	// Auth Routes
	http.HandleFunc("/auth/google", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		q.Add("provider", "google")
		r.URL.RawQuery = q.Encode()
		gothic.BeginAuthHandler(w, r)
	})

	http.HandleFunc("/auth/google/callback", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		q.Add("provider", "google")
		r.URL.RawQuery = q.Encode()
		handleAuthCallback(w, r)
	})

	// Protected
	http.HandleFunc("/dashboard", authMiddleware(handleDashboard))
	http.HandleFunc("/user", authMiddleware(handleUser))
	http.HandleFunc("/logout", handleLogout)

	// Payment Routes
	http.HandleFunc("/api/purchase", authMiddleware(handlePurchase))
	http.HandleFunc("/api/cancel-purchase", authMiddleware(handleCancelPurchase)) // Explicit Cancel
	http.HandleFunc("/api/allocate-device", authMiddleware(handleAllocateDevice))

	// Debug endpoint (no auth required for testing)
	http.HandleFunc("/api/check-status", handleCheckStatus)
	http.HandleFunc("/api/fix-pending", handleFixPending)
	http.HandleFunc("/api/sync-tokens", handleSyncTokens)
	http.HandleFunc("/api/my-devices", handleMyDevices)   // Polling
	http.HandleFunc("/api/check-stock", handleCheckStock) // API Gateway Stock Check

	// EMERGENCY CLEAR DATA (NUKE)
	http.HandleFunc("/api/nuke-data", func(w http.ResponseWriter, r *http.Request) {
		db.Exec("DELETE FROM subscriptions")
		db.Exec("DELETE FROM transactions") // Also reset history
		w.Write([]byte("All subscriptions and transactions deleted (NUKED). Restart Node.js backend to clear memory."))
	})

	// PAKASIR Callback
	http.HandleFunc("/api/pakasir/callback", handlePakasirCallback)

	// Redemption Code Routes
	http.HandleFunc("/api/redemption/generate", handleGenerateRedemptionCode)
	http.HandleFunc("/api/redemption/redeem/new", authMiddleware(handleRedeemCodeNew))
	http.HandleFunc("/api/redemption/redeem/extend", authMiddleware(handleRedeemCodeExtend))

	// Debug endpoint to check session
	http.HandleFunc("/api/check-session", handleCheckSession)

	log.Println("Server executing on port 8080...")
	log.Println("Ready for Google login + Midtrans Payment (QRIS supported).")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}

// --- Initialization ---
func initDB() {
	var err error
	db, err = gorm.Open(sqlite.Open(DbName), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	db.AutoMigrate(&User{}, &Subscription{}, &Transaction{}, &RedemptionCode{})
}

// --- Handlers ---

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if isAuthenticated(r) {
		http.Redirect(w, r, "/dashboard", http.StatusFound)
		return
	}
	renderTemplate(w, "index.html", nil)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if isAuthenticated(r) {
		http.Redirect(w, r, "/dashboard", http.StatusFound)
		return
	}
	renderTemplate(w, "login.html", nil)
}

func handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	gothUser, err := gothic.CompleteUserAuth(w, r)
	if err != nil {
		fmt.Fprintln(w, "Auth Failed", err)
		return
	}

	// Find or Create User
	var user User
	// 1. Try to find by Social ID
	err = db.Where("social_id = ? AND provider = ?", gothUser.UserID, "google").First(&user).Error

	if err == gorm.ErrRecordNotFound {
		// 2. Fallback: Lookup by Email (Unscoped to check for soft-deleted accounts too)
		// This prevents "UNIQUE constraint failed" if a soft-deleted user exists with the same email.
		err = db.Unscoped().Where("email = ?", gothUser.Email).First(&user).Error
	}

	if err == gorm.ErrRecordNotFound {
		// Create new user (Truly new, and no soft-deleted conflict)
		user = User{
			Email:     gothUser.Email,
			Name:      gothUser.Name,
			Provider:  "google",
			SocialID:  gothUser.UserID,
			NumericID: generateNumericID(),
		}
		if result := db.Create(&user); result.Error != nil {
			log.Printf("Failed to create user: %v", result.Error)
			// Returning detail error for debugging
			http.Error(w, fmt.Sprintf("Login failed (Database Error: %v)", result.Error), http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		// Some other DB error
		log.Printf("Database error finding user: %v", err)
		http.Error(w, "Login failed (Database Search Error)", http.StatusInternalServerError)
		return
	} else {
		// User found (Active or Soft-Deleted)

		// If soft-deleted, revive the account
		if user.DeletedAt.Valid {
			log.Printf("Reviving soft-deleted user: %s", user.Email)
			db.Model(&user).Unscoped().Update("deleted_at", nil)
		}

		// Update info to ensure it matches Google
		user.Name = gothUser.Name
		user.Email = gothUser.Email
		user.SocialID = gothUser.UserID

		if saveErr := db.Save(&user).Error; saveErr != nil {
			log.Printf("Failed to update user info: %v", saveErr)
		}
	}

	createSession(w, r, user.ID, user.Name, user.NumericID)
	http.Redirect(w, r, "/dashboard", http.StatusFound)
}

func handleDashboard(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "session-name")
	name, _ := session.Values["name"].(string)
	numericID, _ := session.Values["numeric_id"].(string)

	// Safe userID retrieval
	val := session.Values["user_id"]
	var userID uint
	if v, ok := val.(uint); ok {
		userID = v
	} else {
		log.Printf("Session user_id type mismatch or missing: %T %v", val, val)
		// Try to recover if it's int (sometimes happens)
		if vInt, ok := val.(int); ok {
			userID = uint(vInt)
		}
	}

	log.Printf("Dashboard for UserID: %d, Name: %s", userID, name)

	// Fetch Transactions for Dashboard
	var transactions []Transaction
	db.Where("user_id = ?", userID).Order("created_at desc").Find(&transactions)

	// Fetch Active Subscriptions
	// Auto-expire subscriptions that are past due
	checkAndCleanupExpired(userID)

	var subscriptions []Subscription
	db.Where("user_id = ? AND active = ?", userID, true).Find(&subscriptions)

	// Deduplicate Subscriptions: Keep only the latest expiry for each UDID
	uniqueSubsMap := make(map[string]Subscription)
	for _, sub := range subscriptions {
		if existing, ok := uniqueSubsMap[sub.DeviceUDID]; ok {
			if sub.ExpiresAt.After(existing.ExpiresAt) {
				// Mark the older one as inactive in DB to clean up
				db.Model(&existing).Update("active", false)
				uniqueSubsMap[sub.DeviceUDID] = sub
			} else {
				// Mark current one as inactive
				db.Model(&sub).Update("active", false)
			}
		} else {
			uniqueSubsMap[sub.DeviceUDID] = sub
		}
	}

	// Convert map back to slice
	subscriptions = []Subscription{}
	for _, sub := range uniqueSubsMap {
		// HIDE UNPAID RESERVATIONS
		// Check if this subscription is linked to a PENDING transaction
		var linkedTrx Transaction
		// If order_id is present, check transaction status
		if sub.OrderID != "" {
			if err := db.Where("order_id = ?", sub.OrderID).First(&linkedTrx).Error; err == nil {
				// If transaction is pending, DO NOT SHOW in dashboard (it is reserved but not ready)
				if linkedTrx.Status == "pending" {
					continue
				}
			}
		}

		subscriptions = append(subscriptions, sub)
	}

	// Find pending claims (PAID/SUCCESS but NOT ALLOCATED)
	var pendingClaims []Transaction
	// Fix: Filter by status='success' AND is_allocated=false
	// Also include 'pending' if we want to show them awaiting payment, but for allocation we need Success.
	// The template iterates .PendingClaims.
	// Let's assume 'PendingClaims' are those ready to be allocated or claimed.
	if err := db.Where("user_id = ? AND status = ? AND is_allocated = ?", userID, "success", false).Find(&pendingClaims).Error; err != nil {
		log.Printf("Error finding pending claims: %v", err)
	}
	log.Printf("Found %d active subscriptions for user %d", len(subscriptions), userID)

	data := map[string]interface{}{
		"Name":      name,
		"NumericID": numericID,

		"Transactions":  transactions,
		"Subscriptions": subscriptions,
		"ActiveCount":   len(subscriptions),
		"PendingClaims": pendingClaims,
		"StockCount":    3, // Harcoded fallback or fetch
		"AppBaseURL":    AppBaseURL,
	}
	renderTemplate(w, "dashboard.html", data)
}

func handlePurchase(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "session-name")
	// name and email are unused in redirect flow
	// name, _ := session.Values["name"].(string)
	// email, _ := session.Values["email"].(string)

	var req struct {
		Amount int64  `json:"amount"`
		Plan   string `json:"plan"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid Request", http.StatusBadRequest)
		return
	}

	// Add Admin Fee
	originalAmount := req.Amount
	totalAmount := originalAmount + AdminFee
	orderId := fmt.Sprintf("SANDBOX-INV-%d-%s", time.Now().Unix(), generateNumericID())

	// PAKASIR Redirect Construction
	// Format: https://app.pakasir.com/pay/{slug}/{amount}?order_id={order_id}&redirect={callback_url}&expiry=300
	redirectUrlParam := url.QueryEscape(AppBaseURL + "/dashboard")

	pakasirUrl := fmt.Sprintf("%s/pay/%s/%d?order_id=%s&redirect=%s&expiry=300",
		PakasirBaseURL, PakasirSlug, totalAmount, orderId, redirectUrlParam)

	// In Sandbox mode, we might need a different URL or just assume the Slug is in sandbox mode.
	// Based on the user image "Mode: Sandbox", the same URL likely works but processes in sandbox.

	log.Printf("Generated Pakasir URL: %s", pakasirUrl)

	// Retrieve UserID safely
	val := session.Values["user_id"]
	var userID uint
	if v, ok := val.(uint); ok {
		userID = v
	} else if vInt, ok := val.(int); ok {
		userID = uint(vInt)
	}

	// --- 1. PRE-ALLOCATE DEVICE (RESERVATION) ---
	// "Berkurang pas pencet pay" - Deduct stock immediately (Reserve for 5 mins)

	// Determine RAM based on Plan
	ramSize := 4 // Default VIP
	if strings.Contains(strings.ToUpper(req.Plan), "LITE") {
		ramSize = 3
	}

	// Call Node Backend to allocate
	// We reserve on the backend for 7 days (standard), but handle "expiry" locally if not paid.
	// This avoids complex "extend" logic on Node side. We just kill it if not paid.
	requestBody, _ := json.Marshal(map[string]int{
		"duration": 86400 * 7,
		"ram":      ramSize,
	})

	resp, allocErr := http.Post(NodeBackendURL+"/api/allocate", "application/json", bytes.NewBuffer(requestBody))
	if allocErr != nil {
		log.Println("Error calling node backend during purchase scan:", allocErr)
		http.Error(w, "System Error: Allocation Failed", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// STOCK HABIS / NOT AVAILABLE
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable) // 503
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "Maaf, Stok Habis (Out of Stock). Silahkan coba lagi nanti.",
		})
		return
	}

	var result struct {
		Success   bool   `json:"success"`
		Token     string `json:"token"`
		Udid      string `json:"udid"`
		Url       string `json:"url"`
		ExpiresAt int64  `json:"expiresAt"` // ms
	}
	if decodeErr := json.NewDecoder(resp.Body).Decode(&result); decodeErr != nil {
		log.Printf("Error decoding backend allocation response: %v", decodeErr)
		http.Error(w, "System Error: Invalid Response", http.StatusInternalServerError)
		return
	}

	// Register token
	tokenData := map[string]interface{}{
		"token":     result.Token,
		"udid":      result.Udid,
		"expiresAt": result.ExpiresAt,
	}
	tokenJSON, _ := json.Marshal(tokenData)
	http.Post(NodeBackendURL+"/api/register-token", "application/json", bytes.NewBuffer(tokenJSON))

	// Create Subscription (RESERVATION MODE: 5 Minutes Expiry)
	// "Ada expirednya 5 menit jika 5 menit ga bayar expired dan balik lagi devicenya"
	reservationExpiry := time.Now().UTC().Add(5 * time.Minute) // Unified Expiry Time (UTC)
	sub := Subscription{
		UserID:     userID,
		DeviceUDID: result.Udid,
		OrderID:    orderId,
		Token:      result.Token,
		StreamURL:  result.Url,
		ExpiresAt:  reservationExpiry, // Only 5 mins to pay
		Active:     true,              // Active so it shows on dashboard (as pending/reserved)
	}
	if err := db.Create(&sub).Error; err != nil {
		log.Printf("Failed to create subscription reservation: %v", err)
		http.Error(w, "Database Error", http.StatusInternalServerError)
		// Should release device here ideally, but background cleanup will catch it.
		return
	}

	// Create Transaction
	trx := Transaction{
		UserID:      userID,
		OrderID:     orderId,
		Amount:      totalAmount,
		Plan:        req.Plan,
		Status:      "pending",
		IsAllocated: true, // It IS allocated (Reserved)
	}
	db.Create(&trx)

	// --- 2. GENERATE QRIS VIA PAKASIR API ---
	// Using the provided cURL structure
	pakasirData := map[string]interface{}{
		"project":        strings.Replace(PakasirSlug, "-", "", -1), // Often slugs are cleaner in project field, or use slug directly. Let's try direct.
		"order_id":       orderId,
		"amount":         totalAmount,
		"api_key":        PakasirApiKey,
		"expiry_seconds": 300, // Attempt to set expiry (5 minutes) if supported
	}

	// Just use the slug as configured constants for now to be safe
	pakasirData["project"] = "depodomain" // Override for testing per user request structure, or use Env?
	// User said: "project": "depodomain" in example. I should properly use the user's configured Slug.
	// But let's use the variable:
	pakasirData["project"] = PakasirSlug

	jsonPakasir, _ := json.Marshal(pakasirData)

	client := &http.Client{Timeout: 10 * time.Second}
	pReq, _ := http.NewRequest("POST", "https://app.pakasir.com/api/transactioncreate/qris", bytes.NewBuffer(jsonPakasir))
	pReq.Header.Set("Content-Type", "application/json")

	pResp, err := client.Do(pReq)
	if err != nil {
		log.Printf("Pakasir API Error: %v", err)
		http.Error(w, "Payment Gateway Error", http.StatusBadGateway)
		return
	}
	defer pResp.Body.Close()

	// Read response
	// The user provided response structure: { "payment": { "payment_number": "QR_STRING", ... } }
	var pResult struct {
		Payment struct {
			PaymentNumber string `json:"payment_number"` // The QR String
			TotalPayment  int64  `json:"total_payment"`
			ExpiredAt     string `json:"expired_at"` // e.g. "2025-09-19T01:18:49.678622564Z"
		} `json:"payment"`
	}

	// Keep raw body for debugging if decode fails
	pBody, _ := io.ReadAll(pResp.Body)
	log.Printf("Pakasir Response: %s", string(pBody))

	if err := json.Unmarshal(pBody, &pResult); err != nil {
		log.Printf("Start JSON Decode Error: %v", err)
		http.Error(w, "Invalid Payment Response", http.StatusInternalServerError)
		return
	}

	// UPDATE: Parse Pakasir Expiry and align reservation
	finalExpiry := reservationExpiry // Default fallback
	if pResult.Payment.ExpiredAt != "" {
		// Try parsing the time. The example has nanoseconds, so use RFC3339Nano or a custom layout.
		// Go's RFC3339 parser handles fractional seconds if they are present when parsing with RFC3339 usually,
		// but let's be explicit if needed. safely.
		parsedTime, err := time.Parse(time.RFC3339, pResult.Payment.ExpiredAt)
		if err != nil {
			// Try Nano just in case standard RFC3339 didn't catch it (though it usually does)
			parsedTime, err = time.Parse(time.RFC3339Nano, pResult.Payment.ExpiredAt)
		}

		if err == nil {
			finalExpiry = parsedTime
			// Update the subscription reservation in DB
			if updateErr := db.Model(&Subscription{}).
				Where("order_id = ?", orderId).
				Update("expires_at", finalExpiry).Error; updateErr != nil {
				log.Printf("Failed to update subscription expiry: %v", updateErr)
			} else {
				log.Printf("Updated reservation expiry for Order %s to %v (Source: QRIS)", orderId, finalExpiry)
			}
		} else {
			log.Printf("Warning: Could not parse Pakasir expired_at '%s': %v. Keeping default 5m.", pResult.Payment.ExpiredAt, err)
		}
	}

	// Return JSON with QR String
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token":        orderId,
		"order_id":     orderId,
		"qr_string":    pResult.Payment.PaymentNumber, // QRIS string to generate QR code on frontend
		"amount":       totalAmount,
		"expiry_time":  finalExpiry.Format(time.RFC3339), // Send the aligned expiry time
		"redirect_url": "",                               // Clear this so frontend uses QR mode
	})
}

// --- PAKASIR Helpers ---

// Removed Doku Signature Generation as Pakasir URL integration doesn't need it on the frontend/redirect side.
// Webhook validation might need a different secret if Pakasir sends one.

func handleAllocateDevice(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "session-name")

	// Safe userID retrieval (Repeated logic, could be refactored but inline is fine for now)
	val := session.Values["user_id"]
	var userID uint
	if v, ok := val.(uint); ok {
		userID = v
	} else if vInt, ok := val.(int); ok {
		userID = uint(vInt)
	}

	// Decode potential body for OrderID (optional but recommended to link trx)
	var reqBody struct {
		OrderID string `json:"order_id"`
	}
	// We try to decode, but if it fails (empty body), we proceed just allocating (legacy compat)
	// But to fix the invoice issue, frontend MUST send it.
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Println("AllocateDevice: No request body or bad JSON:", err)
	}

	log.Printf("AllocateDevice called. UserID: %d. OrderID from body: %s", userID, reqBody.OrderID)

	// Payment is checked prior to this call (via Dashboard UI or Webhook status).
	// We assume if this endpoint is called, the frontend believes it's allowed.
	// We will double check status matches 'success' though.

	// --- 1. Verify Transaction Status in DB AND OWNERSHIP ---
	var trx Transaction
	// STRICT CHECK: Ensure the transaction belongs to the authenticated user.
	if err := db.Where("order_id = ? AND user_id = ?", reqBody.OrderID, userID).First(&trx).Error; err != nil {
		log.Printf("Security Warning: User %d attempted to allocate Order %s which does not belong to them or doesn't exist.", userID, reqBody.OrderID)
		http.Error(w, "Transaction not found or access denied", http.StatusNotFound)
		return
	}

	if trx.Status != "success" && trx.Status != "completed" {
		log.Printf("Transaction %s is NOT paid (status=%s)", reqBody.OrderID, trx.Status)
		http.Error(w, "Payment not settled yet", http.StatusPaymentRequired)
		return
	}

	if trx.IsAllocated {
		// ALREADY ALLOCATED (Normal flow now due to PRE-ALLOCATION)
		// Verify if we need to EXTEND the subscription (from 5 mins to Full Duration)

		var sub Subscription
		// Find the subscription linked to this OrderID
		if err := db.Where("order_id = ?", reqBody.OrderID).First(&sub).Error; err == nil {
			// Check if expiry is short (less than 1 day, implying it's the 5 min reservation)
			// Standard duration is 7 days.
			if sub.ExpiresAt.Before(time.Now().Add(24 * time.Hour)) {
				log.Printf("Extending reservation for Order %s to full duration (7 days)", reqBody.OrderID)
				sub.ExpiresAt = time.Now().Add(7 * 24 * time.Hour) // Extend to 7 days
				sub.Active = true
				db.Save(&sub)
			}

			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"device":  sub,
				"message": "Device reservation confirmed and extended.",
			})
			return
		} else {
			// IsAllocated=true but no Sub found? Weird. Fallback to create new one below?
			// No, safer to error or just proceed if we can recover.
			log.Printf("Warning: Transaction %s is allocated but no Subscription found with that OrderID. Attempting recovery...", reqBody.OrderID)
			// Ensure we don't double allocate if possible.
			// Let's proceed to allocation code below ONLY if we really lost the sub.
		}
	}

	// --- 2. Proceed to Allocate Device (Legacy/Fallback) ---
	// This code runs only if IsAllocated=false OR recovery needed
	// Determine RAM based on Plan
	ramSize := 4 // Default VIP

	// Check Transaction Plan for "LITE"
	// We need to fetch the transaction details again if we don't have the Plan handy here easily,
	// but better yet, let's fetch the Trx to confirm Plan.
	var currentTrx Transaction
	if err := db.Where("order_id = ?", reqBody.OrderID).First(&currentTrx).Error; err == nil {
		if strings.Contains(strings.ToUpper(currentTrx.Plan), "LITE") {
			ramSize = 3
		}
	}

	// Call Node Backend to allocate
	// Assuming ws-scrcpy runs on port 8000 and Path /
	requestBody, _ := json.Marshal(map[string]int{
		"duration": 86400 * 7, // 7 Days
		"ram":      ramSize,
	})
	resp, allocErr := http.Post(NodeBackendURL+"/api/allocate", "application/json", bytes.NewBuffer(requestBody))
	if allocErr != nil {
		log.Println("Error calling node backend:", allocErr)
		http.Error(w, "Failed to allocate device", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, "No devices available", http.StatusServiceUnavailable)
		return
	}

	var result struct {
		Success   bool   `json:"success"`
		Token     string `json:"token"`
		Udid      string `json:"udid"`
		Url       string `json:"url"`
		ExpiresAt int64  `json:"expiresAt"` // ms
	}
	if decodeErr := json.NewDecoder(resp.Body).Decode(&result); decodeErr != nil {
		log.Printf("Error decoding backend response: %v", decodeErr)
		http.Error(w, "Invalid response from backend", http.StatusInternalServerError)
		return
	}

	// Create Subscription
	sub := Subscription{
		UserID:     userID,
		DeviceUDID: result.Udid,
		OrderID:    reqBody.OrderID, // Link OrderID
		Token:      result.Token,
		StreamURL:  result.Url,
		ExpiresAt:  time.Unix(result.ExpiresAt/1000, 0),
		Active:     true,
	}
	db.Create(&sub)

	// Register token with Node.js backend for stream validation
	tokenData := map[string]interface{}{
		"token":     result.Token,
		"udid":      result.Udid,
		"expiresAt": result.ExpiresAt,
	}
	tokenJSON, _ := json.Marshal(tokenData)
	tokenResp, tokenErr := http.Post(NodeBackendURL+"/api/register-token", "application/json", bytes.NewBuffer(tokenJSON))
	if tokenErr != nil {
		log.Printf("Warning: Failed to register token with Node.js backend: %v", tokenErr)
	} else {
		tokenResp.Body.Close()
		log.Printf("Token registered with Node.js backend for device %s", result.Udid)
	}

	// Update Transaction Status
	// Update Transaction Status & Mark Allocated
	updated := false
	if reqBody.OrderID != "" {
		var trx Transaction
		if err := db.Where("order_id = ?", reqBody.OrderID).First(&trx).Error; err == nil {
			trx.Status = "success"
			trx.IsAllocated = true
			db.Save(&trx)
			updated = true
			log.Printf("Updated OrderID %s to success/allocated.", reqBody.OrderID)
		} else {
			log.Printf("Warning: Transaction for OrderID %s not found.", reqBody.OrderID)
		}
	}

	// FALLLBACK
	if !updated {
		log.Println("Attempting fallback update for latest pending transaction...")
		var lastTrx Transaction
		// Find latest pending transaction for this user
		if err := db.Where("user_id = ? AND status = ?", userID, "pending").Order("created_at desc").First(&lastTrx).Error; err == nil {
			lastTrx.Status = "success"
			db.Save(&lastTrx)
			log.Printf("Fallback: Updated latest pending transaction %s (ID: %d) to success.", lastTrx.OrderID, lastTrx.ID)
		} else {
			log.Printf("Fallback failed: No pending transactions found for user %d", userID)
		}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"device":  sub,
	})
}

// Debug endpoint to check PAKASIR transaction status
func handleCheckStatus(w http.ResponseWriter, r *http.Request) {
	orderID := r.URL.Query().Get("order_id")
	if orderID == "" {
		http.Error(w, "order_id parameter is required", http.StatusBadRequest)
		return
	}

	// Check status from PAKASIR
	status, err := checkPakasirStatus(orderID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  false,
			"error":    err.Error(),
			"order_id": orderID,
		})
		return
	}

	// Return full status
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":            true,
		"order_id":           orderID,
		"transaction_status": status,
	})
}

// Fix all pending transactions by checking actual PAKASIR status
func handleFixPending(w http.ResponseWriter, r *http.Request) {
	// Get all pending transactions
	var pendingTrx []Transaction
	db.Where("status = ?", "pending").Find(&pendingTrx)

	log.Printf("Found %d pending transactions to check", len(pendingTrx))

	updated := 0
	failed := 0
	results := []map[string]interface{}{}

	for _, trx := range pendingTrx {
		// Check status from PAKASIR
		status, err := checkPakasirStatus(trx.OrderID)
		if err != nil {
			failed++
			results = append(results, map[string]interface{}{
				"order_id": trx.OrderID,
				"status":   "error",
				"error":    err.Error(),
			})
			continue
		}

		if status == "SUCCESS" || status == "NOT_FOUND" {
			// For sandbox: Treat NOT_FOUND as SUCCESS (simulator doesn't have proper status endpoint)
			trx.Status = "success"
			db.Save(&trx)
			updated++
			log.Printf("✅ Updated %s to success (PAKASIR status: %s)", trx.OrderID, status)
			results = append(results, map[string]interface{}{
				"order_id":           trx.OrderID,
				"status":             "updated",
				"transaction_status": status,
				"note":               "Marked as SUCCESS (sandbox mode)",
			})

			// Extend Subscription if it was reserved
			var sub Subscription
			if err := db.Where("order_id = ?", trx.OrderID).First(&sub).Error; err == nil {
				if sub.ExpiresAt.Before(time.Now().Add(24 * time.Hour)) {
					sub.ExpiresAt = time.Now().UTC().Add(7 * 24 * time.Hour) // 7 days (Use UTC)
					sub.Active = true                                        // Revive if it was cleaned up
					db.Save(&sub)
					log.Printf("✅ Extended and Reactivated reservation for %s to 7 days", trx.OrderID)
				}
			}
		} else {
			results = append(results, map[string]interface{}{
				"order_id":           trx.OrderID,
				"status":             "unchanged",
				"transaction_status": status,
			})
		}
	}

	// Prepare list of updated order IDs for frontend notification
	updatedOrderIDs := []string{}
	for _, result := range results {
		if result["status"] == "updated" {
			updatedOrderIDs = append(updatedOrderIDs, result["order_id"].(string))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"total_pending": len(pendingTrx),
		"updated":       updatedOrderIDs,
		"count":         updated,
		"failed":        failed,
		"results":       results,
		"message":       fmt.Sprintf("Updated %d transactions to SUCCESS", updated),
	})
}

// Get PAKASIR Access Token (SNAP API requirement)
func getPakasirAccessToken() (string, error) {
	timestamp := time.Now().UTC().Format("2006-01-02T15:04:05Z")

	// Create signature for access token request
	// Simplified token place holder
	_ = PakasirSlug

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("POST", PakasirBaseURL+"/authorization/v1/access-token/b2b", nil)
	// req.Header.Set("X-CLIENT-KEY", PakasirClientID) // Use slug?
	req.Header.Set("X-TIMESTAMP", timestamp)
	// req.Header.Set("X-SIGNATURE", signature)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error getting PAKASIR access token: %v", err)
		return "", err
	}
	defer resp.Body.Close()

	// ... Simplified for refactor, this function might not be needed for Redirect method.
	return "", nil
}

// checkPakasirStatus - Need to implement via Webhook or specific API if available.
// For now, since documentation for Status API is sparse in summary, we'll return "PENDING"
// or rely on Webhook to update status.
func checkPakasirStatus(invoiceNumber string) (string, error) {
	// Placeholder for actual API check if available
	return "pending", nil
}

func handleUser(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "session-name")
	name, _ := session.Values["name"].(string)
	numericID, _ := session.Values["numeric_id"].(string)

	renderTemplate(w, "user.html", map[string]interface{}{
		"Name":      name,
		"NumericID": numericID,
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "session-name")
	session.Values["authenticated"] = false
	session.Values["user_id"] = nil
	session.Values["name"] = nil
	session.Values["numeric_id"] = nil
	session.Save(r, w)
	gothic.Logout(w, r)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func handlePakasirCallback(w http.ResponseWriter, r *http.Request) {
	// Handle GET redirect (user returning from payment page)
	if r.Method == "GET" {
		// Get user session to find their pending transactions
		session, _ := store.Get(r, "session-name")
		val := session.Values["user_id"]
		var userID uint
		if v, ok := val.(uint); ok {
			userID = v
		} else if vInt, ok := val.(int); ok {
			userID = uint(vInt)
		}

		// Auto-check all pending transactions for this user
		if userID > 0 {
			var pendingTrx []Transaction
			db.Where("user_id = ? AND status = ?", userID, "pending").Find(&pendingTrx)

			for _, trx := range pendingTrx {
				// Check status from PAKASIR
				status, err := checkPakasirStatus(trx.OrderID)
				if err != nil {
					log.Printf("Error checking status for %s: %v", trx.OrderID, err)
					continue
				}

				log.Printf("Auto-check: Transaction %s status: %s", trx.OrderID, status)

				// Update if success
				if status == "SUCCESS" {
					db.Model(&trx).Update("status", "success")
					log.Printf("✅ Transaction %s updated to success", trx.OrderID)

					// Extend Subscription
					var sub Subscription
					if err := db.Where("order_id = ?", trx.OrderID).First(&sub).Error; err == nil {
						sub.ExpiresAt = time.Now().UTC().Add(7 * 24 * time.Hour)
						sub.Active = true // Revive
						db.Save(&sub)
						log.Printf("Auto-check: Extended and Reactivated reservation for %s", trx.OrderID)
					}
				}
			}
		}

		http.Redirect(w, r, "/dashboard", http.StatusFound)
		return
	}

	// Handle POST webhook from PAKASIR
	if r.Method == "POST" {
		body, _ := io.ReadAll(r.Body)
		log.Printf("PAKASIR Webhook received: %s", string(body))

		// Parse PAKASIR notification (Flat structure based on logs)
		var notification struct {
			Amount        int64  `json:"amount"`
			OrderID       string `json:"order_id"`
			Status        string `json:"status"`
			PaymentMethod string `json:"payment_method"`
			Project       string `json:"project"` // Verify this matches ours
		}

		if err := json.Unmarshal(body, &notification); err != nil {
			log.Printf("Error parsing PAKASIR webhook: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// Security Check: Verify 'project' matches our slug to prevent generic attacks
		// (Ideally Pakasir sends a signature header, checking docs for X-Pakasir-Signature or similar is best practice)
		// Since we don't have docs on specific signature header yet, we verify the data content at least.
		if notification.Project != PakasirSlug {
			log.Printf("Security Warning: Webhook project '%s' does not match expected '%s'", notification.Project, PakasirSlug)
			w.WriteHeader(http.StatusForbidden)
			return
		}

		// Update transaction status in database
		invoiceNumber := notification.OrderID
		status := strings.ToLower(notification.Status) // e.g., "completed"

		log.Printf("Updating transaction %s to status: %s", invoiceNumber, status)

		var trx Transaction
		if err := db.Where("order_id = ?", invoiceNumber).First(&trx).Error; err != nil {
			log.Printf("Transaction not found: %s", invoiceNumber)
			w.WriteHeader(http.StatusNotFound)
			return
		}

		// Map 'completed' to 'success' for our DB
		dbStatus := status
		if status == "completed" {
			dbStatus = "success"
		}

		// Update status
		db.Model(&trx).Update("status", dbStatus)
		log.Printf("Transaction %s updated to %s", invoiceNumber, dbStatus)

		// EXTEND SUBSCRIPTION IF SUCCESS
		if dbStatus == "success" {
			var sub Subscription
			if err := db.Where("order_id = ?", invoiceNumber).First(&sub).Error; err == nil {
				// Only extend if it looks like a reservation (short expiry) or just enforce 7 days
				sub.ExpiresAt = time.Now().UTC().Add(7 * 24 * time.Hour)
				sub.Active = true // Revive
				db.Save(&sub)
				log.Printf("WebHook: Extended and Reactivated reservation for %s to 7 days", invoiceNumber)
			}
		}

		// Respond to PAKASIR
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"message":"OK"}`))
		return
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
}

// --- Helpers ---

func renderTemplate(w http.ResponseWriter, tmpl string, data interface{}) {
	t, err := template.ParseFiles(filepath.Join("templates", tmpl))
	if err != nil {
		log.Printf("Error parsing template %s: %v", tmpl, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	err = t.Execute(w, data)
	if err != nil {
		log.Printf("Error executing template %s: %v", tmpl, err)
	}
}

func createSession(w http.ResponseWriter, r *http.Request, userID uint, name string, numericID string) {
	session, _ := store.Get(r, "session-name")
	session.Values["authenticated"] = true
	session.Values["user_id"] = userID
	session.Values["name"] = name
	session.Values["numeric_id"] = numericID

	// Also get email from database and store it
	var user User
	if err := db.First(&user, userID).Error; err == nil {
		session.Values["email"] = user.Email
	}

	session.Save(r, w)
}

func generateNumericID() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return fmt.Sprintf("%08d", r.Intn(100000000))
}

func isAuthenticated(r *http.Request) bool {
	session, _ := store.Get(r, "session-name")
	if auth, ok := session.Values["authenticated"].(bool); ok && auth {
		return true
	}
	return false
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isAuthenticated(r) {
			// Check if this is an API request
			if strings.HasPrefix(r.URL.Path, "/api/") {
				// Return JSON error for API requests
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success": false,
					"message": "Anda harus login terlebih dahulu",
				})
				return
			}
			// Redirect to login for page requests
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}
		next(w, r)
	}
}

// handleCancelPurchase allows the user to manually cancel a pending reservation
func handleCancelPurchase(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	session, _ := store.Get(r, "session-name")
	val := session.Values["user_id"]
	var userID uint
	if v, ok := val.(uint); ok {
		userID = v
	} else if vInt, ok := val.(int); ok {
		userID = uint(vInt)
	} else {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		OrderID string `json:"order_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid Request", http.StatusBadRequest)
		return
	}

	log.Printf("Request to cancel purchase %s by user %d", req.OrderID, userID)

	// Find the transaction/subscription
	// We need to verify it belongs to the user
	var sub Subscription
	if err := db.Where("order_id = ? AND user_id = ?", req.OrderID, userID).First(&sub).Error; err != nil {
		log.Printf("Cancel Purchase: Subscription not found for order %s", req.OrderID)
		// Try finding transaction separately if subscription strictly relies on it
		var trx Transaction
		if err := db.Where("order_id = ? AND user_id = ?", req.OrderID, userID).First(&trx).Error; err == nil {
			// If transaction exists but no subscription (maybe failed partial state), just cancel transaction
			if trx.Status == "pending" {
				cancelPakasirTransaction(trx.OrderID, trx.Amount)
				trx.Status = "cancelled"
				db.Save(&trx)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Transaction cancelled"})
		return
	}

	// If we found the subscription, use performCleanup to do the heavy lifting
	// (Releases device, updates DB, cancels Pakasir)
	performCleanup(sub)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Purchase cancelled and stock released",
	})
}

// handleMyDevices returns active devices for the current logged-in user (Frontend Polling)
func handleMyDevices(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "session-name")
	val := session.Values["user_id"]
	var userID uint

	if v, ok := val.(uint); ok {
		userID = v
	} else if vInt, ok := val.(int); ok { // Handle potential type mismatch
		userID = uint(vInt)
	} else {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Auto-expire subscriptions that are past due
	checkAndCleanupExpired(userID)

	var subscriptions []Subscription
	db.Where("user_id = ? AND active = ?", userID, true).Order("created_at desc").Find(&subscriptions)

	// Deduplicate Subscriptions
	uniqueSubsMap := make(map[string]Subscription)
	for _, sub := range subscriptions {
		if existing, ok := uniqueSubsMap[sub.DeviceUDID]; ok {
			if sub.ExpiresAt.After(existing.ExpiresAt) {
				db.Model(&existing).Update("active", false)
				uniqueSubsMap[sub.DeviceUDID] = sub
			} else {
				db.Model(&sub).Update("active", false)
			}
		} else {
			uniqueSubsMap[sub.DeviceUDID] = sub
		}
	}

	subscriptions = []Subscription{}
	for _, sub := range uniqueSubsMap {
		subscriptions = append(subscriptions, sub)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(subscriptions)
}

// checkAndCleanupExpired finds expired active subscriptions, calls backend cleanup, and marks them inactive
func checkAndCleanupExpired(userID uint) {
	// ... (logic remains for user-specific trigger if needed, but background ticker handles global)
	// We can reuse the logic using a modified query or just keep it for immediate feedback on dashboard load
	var expiredSubs []Subscription
	db.Where("user_id = ? AND active = ? AND expires_at < ?", userID, true, time.Now().UTC()).Find(&expiredSubs)

	for _, sub := range expiredSubs {
		performCleanup(sub)
	}
}

// Background Ticker to clean up ANY expired subscription system-wide
func startBackgroundCleanupTicker() {
	// Faster interval (10s) to ensure users see updates "automatically" without refreshing
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		for {
			select {
			case <-ticker.C:
				var expiredSubs []Subscription
				// Find ALL active but expired subscriptions (Global)
				// Debug log to prove it's running
				// log.Println("[Ticker] Checking for expired subscriptions...")

				if err := db.Where("active = ? AND expires_at < ?", true, time.Now().UTC()).Find(&expiredSubs).Error; err != nil {
					log.Printf("[Background Cleanup] Error fetching expired subs: %v", err)
					continue
				}

				if len(expiredSubs) > 0 {
					log.Printf("[Background Cleanup] Found %d expired subscriptions. Executing cleanup...", len(expiredSubs))
					for _, sub := range expiredSubs {
						// Pass by value/copy is fine, but we need ID for update
						performCleanup(sub)
					}
				}
			}
		}
	}()
	log.Println("Background Cleanup Ticker started (Interval: 10s)")
}

// Global cleanup function to avoid code duplication
func performCleanup(sub Subscription) {
	log.Printf("[Cleanup] Processing expiry for Device: %s (User: %d)", sub.DeviceUDID, sub.UserID)

	// 1. Call Node.js backend to cleanup (Uninstall Roblox & Release Device)
	// This is critical: if successful, availability updates immediately!
	go func(udid string) {
		body, _ := json.Marshal(map[string]string{"udid": udid})
		resp, err := http.Post(NodeBackendURL+"/api/cleanup", "application/json", bytes.NewBuffer(body))
		if err != nil {
			log.Printf("[Cleanup] Node.js cleanup call failed for %s: %v", udid, err)
		} else {
			resp.Body.Close()
			log.Printf("[Cleanup] Node.js cleanup signaled for %s", udid)
		}
	}(sub.DeviceUDID)

	// 2. Mark as inactive in DB reliably
	if err := db.Model(&sub).Update("active", false).Error; err != nil {
		log.Printf("[Cleanup] Failed to update DB status for %s: %v", sub.DeviceUDID, err)
	} else {
		log.Printf("[Cleanup] Device %s marked inactive in DB.", sub.DeviceUDID)
	}

	// 3. CANCEL PAKASIR TRANSACTION (If Pending)
	// If the reservation expired (5 mins) without payment, the transaction on Pakasir stays open for 1 hour by default.
	// We manually cancel it now to release the "pending" state on their end too.
	if sub.OrderID != "" {
		var trx Transaction
		if err := db.Where("order_id = ?", sub.OrderID).First(&trx).Error; err == nil {
			if trx.Status == "pending" {
				log.Printf("[Cleanup] Auto-cancelling Pakasir Transaction %s for expired reservation.", trx.OrderID)
				err := cancelPakasirTransaction(trx.OrderID, trx.Amount)
				if err != nil {
					log.Printf("[Cleanup] Warning: Failed to cancel Pakasir transaction: %v", err)
				} else {
					// Mark locally as cancelled
					trx.Status = "cancelled"
					db.Save(&trx)
				}
			}
		}
	}
}

// cancelPakasirTransaction calls the Pakasir cancellation API
func cancelPakasirTransaction(orderID string, amount int64) error {
	payload := map[string]interface{}{
		"project":  PakasirSlug,
		"order_id": orderID,
		"amount":   amount,
		"api_key":  PakasirApiKey,
	}
	jsonBytes, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", "https://app.pakasir.com/api/transactioncancel", bytes.NewBuffer(jsonBytes))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pakasir returned status %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("[Pakasir] Transaction %s cancelled successfully.", orderID)
	return nil
}

// handleCheckStock proxies the request to Node.js backend to avoid CORS issues
func handleCheckStock(w http.ResponseWriter, r *http.Request) {
	resp, err := http.Get(NodeBackendURL + "/api/devices-available")
	if err != nil {
		// If Node.js is down, assume maintenance/no stock or just error
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"available": 0, "error": "Backend offline"}`))
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
