document.addEventListener('DOMContentLoaded', () => {

    // --- User Profile Sync ---
    const storedUser = localStorage.getItem('username') || 'Guest';
    const profileNameEl = document.getElementById('profile-name');
    const sidebarNameEl = document.getElementById('sidebar-username');

    if (profileNameEl) profileNameEl.innerText = storedUser;
    if (sidebarNameEl) sidebarNameEl.innerText = storedUser;

    // --- View Switching Logic ---
    const navLinks = document.querySelectorAll('[data-target]');
    const sections = document.querySelectorAll('.view-section');

    function switchView(targetId) {
        sections.forEach(section => section.classList.add('hidden'));
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.classList.remove('hidden');

        navLinks.forEach(link => {
            if (link.getAttribute('data-target') === targetId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            if (targetId) switchView(targetId);
        });
    });

    // --- Modal Logic (Reset & Explicit) ---
    const modal = document.getElementById('add-device-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const modalOverlay = document.querySelector('.modal-overlay');

    // Triggers
    const triggerSidebar = document.getElementById('btn-store-sidebar');
    const triggerTop = document.getElementById('add-device-trigger');
    const triggerCard = document.getElementById('add-device-card-btn');

    // Live Stock Check Function
    let stockCheckInterval = null;
    // Expose these globally so dashboard.html inline script can use them
    window.cachedStockData = { available: 0, availableLite: 0, availableVip: 0 };
    window.selectedTier = 'vip'; // Default

    window.updateStockDisplay = function () {
        const stockVal = document.getElementById('stock-val');
        const stockDot = document.getElementById('stock-dot');
        const payBtn = document.getElementById('pay-button-new');

        if (!stockVal || !payBtn) return;

        let count = 0;
        if (window.selectedTier === 'lite') {
            count = window.cachedStockData.availableLite;
        } else {
            count = window.cachedStockData.availableVip;
        }

        // Fallback for safety (if api returns undefined)
        if (count === undefined) count = window.cachedStockData.available;

        if (count > 0) {
            stockVal.innerText = count + " Available";
            if (stockDot) stockDot.style.background = "#30d158"; // iOS Green
            payBtn.disabled = false;
            payBtn.innerText = "Pay with QRIS/VA";
        } else {
            stockVal.innerText = "Out of Stock";
            if (stockDot) stockDot.style.background = "#ff453a"; // iOS Red
            payBtn.disabled = true;
            payBtn.innerText = "Out of Stock";
        }
    }

    async function checkStockLive() {
        const stockVal = document.getElementById('stock-val');
        if (!stockVal) return;

        // Only show "Checking..." on first load if empty
        if (stockVal.innerText === '') stockVal.innerText = "Checking...";

        try {
            // Use timestamp to prevent caching
            const res = await fetch('/api/check-stock?t=' + Date.now());

            // Safety: Check if response is actually JSON
            const contentType = res.headers.get("content-type");
            if (res.ok && contentType && contentType.includes("application/json")) {
                const data = await res.json();

                window.cachedStockData.available = data.available !== undefined ? data.available : 0;
                window.cachedStockData.availableLite = data.availableLite !== undefined ? data.availableLite : 0;
                window.cachedStockData.availableVip = data.availableVip !== undefined ? data.availableVip : 0;

                window.updateStockDisplay();
            }
        } catch (e) {
            console.warn("Stock check warning:", e);
        }
    }

    function toggleModal(show) {
        if (!modal) return;
        if (show) {
            modal.classList.remove('hidden');
            // Ensure flex for centering
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            // Trigger Stock Check Immediately
            checkStockLive();

            // Start Polling every 1 second (Faster polling as per user request to be snappy)
            if (stockCheckInterval) clearInterval(stockCheckInterval);
            stockCheckInterval = setInterval(checkStockLive, 1000);

        } else {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            document.body.style.overflow = '';

            // Stop Polling
            if (stockCheckInterval) {
                clearInterval(stockCheckInterval);
                stockCheckInterval = null;
            }
        }
    }

    // Attach Clean Listeners
    if (triggerSidebar) {
        triggerSidebar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleModal(true);
        });
    }

    if (triggerTop) {
        triggerTop.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleModal(true);
        });
    }

    if (triggerCard) {
        triggerCard.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleModal(true);
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleModal(false);
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) toggleModal(false);
        });
    }

    // --- Selection Logic (Generic) ---
    const selectGroups = ['.server-grid', '.chip-grid'];
    selectGroups.forEach(selector => {
        const container = document.querySelector(selector);
        if (!container) return;
        const items = container.querySelectorAll('.server-btn, .chip-btn');
        items.forEach(item => {
            item.addEventListener('click', function () {
                items.forEach(sib => {
                    sib.classList.remove('selected');
                    sib.classList.remove('active');
                });
                if (this.classList.contains('chip-btn')) {
                    this.classList.add('active');
                } else {
                    this.classList.add('selected');
                }
            });
        });
    });

    // --- Dynamic Plan Logic (VIP Tiers) ---
    const tierData = {
        'lite': {
            core: '8 Core', ram: '3GB RAM', rom: '64GB ROM', android: 'Android 10',
            plans: [
                { id: '7', label: '7-Day', price: 1, daily: 1 }
            ]
        },
        'vip': {
            core: '8 Core', ram: '4GB RAM', rom: '64GB ROM', android: 'Android 12',
            plans: [
                { id: '7', label: '7-Day', price: 21500, daily: 3071 } // Original Price
            ]
        },
        'kvip': {
            core: '8 Core', ram: '8GB RAM', rom: '128GB ROM', android: 'Android 12',
            plans: [
                { id: '7', label: '7-Day', price: 35000, daily: 5000 }
            ]
        },
        'svip': {
            core: '64 Bit', ram: '8GB RAM', rom: '64GB', android: 'Qualcomm',
            plans: [
                { id: '7', label: '7-Day', price: 47000, daily: 6714 }
            ]
        },
        'xvip': {
            core: '16G RAM', ram: '16GB RAM', rom: '256GB ROM', android: 'Qualcomm',
            plans: [
                { id: '7', label: '7-Day', price: 109500, daily: 15642 }
            ]
        }
    };

    const tierTabs = document.querySelectorAll('.tier-tab-btn');
    const specTitle = document.querySelector('.cloud-phone-title-new');
    const specSpecs = document.querySelector('.cloud-phone-specs-new');

    const plansCards = document.querySelectorAll('.plan-card');
    const totalDisplay = document.getElementById('total-display');

    if (plansCards.length > 0) {
        plansCards.forEach(card => {
            card.addEventListener('click', function () {
                plansCards.forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
                const priceText = this.querySelector('.plan-price').innerText;
                if (totalDisplay) totalDisplay.innerText = priceText;
            });
        });
    }

    if (tierTabs.length > 0) {
        tierTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tierTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tier = tab.getAttribute('data-tier');
                const data = tierData[tier];

                if (data) {
                    if (specCore) specCore.innerText = data.core;
                    if (specRam) specRam.innerText = data.ram;
                    if (specRom) specRom.innerText = data.rom;
                    if (specAndroid) specAndroid.innerText = data.android;

                    const p30 = document.querySelector('#plan-30');
                    if (p30) {
                        p30.querySelector('.plan-price').innerText = `Rp ${data.plans[0].price.toLocaleString('id-ID')}`;
                        p30.querySelector('.daily-calc').innerText = `≈ Rp ${data.plans[0].daily}/day`;
                    }

                    const p7 = document.querySelector('#plan-7');
                    if (p7) {
                        p7.querySelector('.plan-price').innerText = `Rp ${data.plans[1].price.toLocaleString('id-ID')}`;
                        p7.querySelector('.daily-calc').innerText = `≈ Rp ${data.plans[1].daily}/day`;
                    }

                    const p90 = document.querySelector('#plan-90');
                    if (p90) {
                        p90.querySelector('.plan-price').innerText = `Rp ${data.plans[2].price.toLocaleString('id-ID')}`;
                        p90.querySelector('.daily-calc').innerText = `≈ Rp ${data.plans[2].daily}/day`;
                    }

                    if (totalDisplay) totalDisplay.innerText = `Rp ${data.plans[0].price.toLocaleString('id-ID')}`;
                    plansCards.forEach(c => c.classList.remove('selected'));
                    if (p30) p30.classList.add('selected');

                    // Update Stock Display for the selected tier
                    if (typeof updateStockDisplay === 'function') {
                        updateStockDisplay();
                    }
                }
            });
        });
    }


    // --- Midtrans Payment Logic with Admin Fee ---
    // --- PAKASIR Payment Logic ---
    window.startPakasirPayment = async function () {
        console.log("Button clicked! Starting PAKASIR Payment...");
        const payButton = document.getElementById('pay-button-new');
        let modalContainer = document.querySelector('.modal-body-new'); // Container to inject QR

        // Visual Feedback immediately
        payButton.innerText = "Generating QRIS...";
        payButton.disabled = true;

        try {
            // Get Selected Price
            const selectedPlanEl = document.querySelector('.plan-option-new.selected');
            const amount = selectedPlanEl ? parseInt(selectedPlanEl.getAttribute('data-price')) : 21500;

            console.log("Initiating Payment for Amount:", amount);

            // Get Selected Tier (Prefer Global State for Safety)
            let tierName = "VIP";
            if (window.selectedTier) {
                tierName = window.selectedTier.toUpperCase();
            } else {
                // Fallback
                const activeTierBtn = document.querySelector('.tier-tab-btn.active');
                tierName = activeTierBtn ? activeTierBtn.querySelector('.tier-name').textContent : "VIP";
            }

            const fullPlanName = tierName + " Cloud Phone Subscription";

            // 1. Request Payment URL
            const response = await fetch('/api/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amount,
                    plan: fullPlanName
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Server Error: ${errText}`);
            }

            const data = await response.json();
            console.log("PAKASIR Response:", data);

            if (data.qr_string) {
                // HIDE Purchase Layout, Footer, AND Header
                document.querySelector('.purchase-layout-new').style.display = 'none';
                document.querySelector('.tier-scroll-container').style.display = 'none';
                document.querySelector('.modal-footer-new').style.display = 'none';
                document.querySelector('.modal-header').style.display = 'none';

                // Clear Modal Background to show only the QR Card
                // Clear Modal Background to show only the QR Card
                const modalContent = document.querySelector('.purchase-modal-new');
                if (modalContent) {
                    modalContent.style.background = 'transparent';
                    modalContent.style.boxShadow = 'none';
                    modalContent.style.border = 'none';
                    modalContent.style.height = 'auto';      // Fix clipping
                    modalContent.style.maxHeight = 'none';   // Fix clipping
                    modalContent.style.overflow = 'visible'; // Fix clipping
                }

                const modalBody = document.querySelector('.modal-body-new');
                if (modalBody) {
                    modalBody.style.maxHeight = 'none';      // Fix clipping
                    modalBody.style.overflow = 'visible';    // Fix clipping
                    modalBody.style.height = 'auto';         // Fix clipping
                }

                // INJECT QR Code View (Responsive iOS Style)
                const qrContainer = document.createElement('div');
                qrContainer.id = 'pakasir-qr-container';
                qrContainer.style.width = '100%';
                qrContainer.style.height = '100%';
                qrContainer.style.display = 'flex';
                qrContainer.style.alignItems = 'center';
                qrContainer.style.justifyContent = 'center';
                qrContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

                qrContainer.innerHTML = `
                    <style>
                        .pakasir-card {
                            background: rgba(28, 28, 30, 0.95);
                            backdrop-filter: blur(30px);
                            -webkit-backdrop-filter: blur(30px);
                            border-radius: 24px;
                            padding: 32px;
                            width: 100%;
                            max-width: 340px; /* Mobile Default */
                            text-align: center;
                            box-shadow: 0 40px 80px rgba(0,0,0,0.5);
                            border: 1px solid rgba(255,255,255,0.1);
                            transition: all 0.3s ease;
                        }
                        .pakasir-flex-content {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            gap: 24px;
                        }
                        .pakasir-info-side { display: flex; flex-direction: column; align-items: center; width: 100%; }
                        .pakasir-qr-side { display: flex; flex-direction: column; align-items: center; width: 100%; }
                        
                        /* Desktop Layout */
                        @media (min-width: 768px) {
                            .pakasir-card {
                                max-width: 700px;
                                padding: 48px;
                                text-align: left;
                            }
                            .pakasir-flex-content {
                                flex-direction: row;
                                align-items: flex-start;
                                justify-content: space-between;
                                gap: 48px;
                            }
                            .pakasir-info-side {
                                align-items: flex-start;
                                order: 1;
                                flex: 1;
                            }
                            .pakasir-qr-side {
                                align-items: center;
                                order: 2;
                                width: auto;
                            }
                            .text-center-mobile { text-align: left !important; }
                            .align-start-desktop { align-items: flex-start !important; }
                        }
                    </style>

                    <div class="pakasir-card">
                        <div class="pakasir-flex-content">
                            
                            <!-- Info Side (Left on Desktop) -->
                            <div class="pakasir-info-side align-start-desktop">
                                <div style="margin-bottom: 20px;" class="text-center-mobile">
                                    <h3 style="margin: 0; color: #fff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">Scan to Pay</h3>
                                    <p style="margin: 6px 0 0; color: #8e8e93; font-size: 15px;">Use your preferred banking app</p>
                                </div>
                                
                                <div style="margin-bottom: 24px;">
                                    <span style="color: #fff; font-size: 32px; font-weight: 700; letter-spacing: -1px;">Rp ${data.amount.toLocaleString('id-ID')}</span>
                                </div>

                                <!-- Timer -->
                                <div style="margin-bottom: 28px;">
                                    <div style="color: #8e8e93; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Expires In</div>
                                    <div id="payment-timer" style="color: #ff453a; font-size: 48px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -2px; line-height: 1;">
                                        --:--
                                    </div>
                                </div>

                                <!-- Order ID Pill -->
                                <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(118, 118, 128, 0.18); padding: 10px 14px; border-radius: 10px; cursor: pointer; transition: background 0.2s;" 
                                     onclick="navigator.clipboard.writeText('${data.order_id}'); alert('Order ID Copied!')"
                                     onmouseover="this.style.background='rgba(118, 118, 128, 0.3)'"
                                     onmouseout="this.style.background='rgba(118, 118, 128, 0.18)'">
                                    <span style="color: #8e8e93; font-size: 13px;">Order ID</span>
                                    <span style="color: #fff; font-family: 'SF Mono', 'Menlo', monospace; font-size: 13px; font-weight: 500;">${data.order_id}</span>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.7; color: #fff;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </div>
                            </div>

                            <!-- QR Side (Right on Desktop) -->
                            <div class="pakasir-qr-side">
                                <div style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                                    <div id="qrcode"></div>
                                </div>
                                
                                <button id="btn-cancel-txn" style="margin-top: 28px; background: transparent; color: #ff453a; border: none; font-size: 16px; font-weight: 500; cursor: pointer; padding: 10px 20px; border-radius: 100px; transition: background 0.2s;">
                                    Cancel Transaction
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                modalContainer.appendChild(qrContainer);

                // Add Hover Effect for Cancel Button
                const cancelBtn = document.getElementById('btn-cancel-txn');
                cancelBtn.addEventListener('mouseenter', () => cancelBtn.style.background = 'rgba(255, 69, 58, 0.1)');
                cancelBtn.addEventListener('mouseleave', () => cancelBtn.style.background = 'transparent');

                // Attach Cancel Listener
                document.getElementById('btn-cancel-txn').addEventListener('click', async () => {
                    if (confirm('Cancel this transaction?')) {
                        await fetch('/api/cancel-purchase', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ order_id: data.order_id })
                        });
                        window.location.reload();
                    }
                });

                // Generate QR Code
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.qr_string)}`;
                document.getElementById('qrcode').innerHTML = `<img src="${qrUrl}" alt="QRIS Code" style="border-radius: 8px;" />`;

                // Handle Expiry Timer
                if (data.expiry_time) {
                    const expiryDate = new Date(data.expiry_time).getTime();
                    const timerEl = document.getElementById('payment-timer');

                    const timerInterval = setInterval(async () => {
                        const now = new Date().getTime();
                        const distance = expiryDate - now;

                        if (distance < 0) {
                            clearInterval(timerInterval);
                            timerEl.innerHTML = "EXPIRED";
                            timerEl.style.color = "#8e8e93";

                            // Auto-Cancel on expiry
                            console.log("Timer expired. Cancelling transaction...");
                            await fetch('/api/cancel-purchase', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ order_id: data.order_id })
                            });

                            window.location.reload();
                            return;
                        }

                        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                        const mStr = minutes < 10 ? "0" + minutes : minutes;
                        const sStr = seconds < 10 ? "0" + seconds : seconds;
                        timerEl.innerHTML = `${mStr}:${sStr}`;
                    }, 1000);
                }

                // Poll for Success status
                const statusPoll = setInterval(async () => {
                    try {
                        const checkRes = await fetch(`/api/check-status?order_id=${data.order_id}`);
                        const checkData = await checkRes.json();
                        if (checkRes.ok && checkData.transaction_status === 'SUCCESS') {
                            clearInterval(statusPoll);
                            alert("Payment Successful!");
                            window.location.reload();
                        }
                    } catch (e) {
                        console.warn("Polling error", e);
                    }
                }, 3000);


            } else if (data.redirect_url) {
                // Fallback to Redirect if QR string missing
                window.location.href = data.redirect_url;
            } else {
                alert(`Error: ${data.message || 'Failed to initiate payment'}`);
                payButton.disabled = false;
                payButton.innerText = "Pay with QRIS/VA";
            }

        } catch (e) {
            alert("Error: " + e.message);
            console.error(e);
            payButton.disabled = false;
            payButton.innerText = "Pay with QRIS/VA";
        }
    };

    // --- Expiry Countdown Logic ---
    function startExpiryTicker() {
        // Run immediately
        updateTickers();
        // Then every second
        setInterval(updateTickers, 1000);
    }

    function updateTickers() {
        document.querySelectorAll('.device-expiry-countdown[data-expires]').forEach(el => {
            const expires = parseInt(el.getAttribute('data-expires'), 10);
            if (!expires) return;

            const now = Math.floor(Date.now() / 1000);
            const diff = expires - now;

            if (diff <= 0) {
                el.innerText = "Expired";
                el.style.color = '#ff453a';
                return;
            }

            const days = Math.floor(diff / 86400);
            const hours = Math.floor((diff % 86400) / 3600);
            const minutes = Math.floor((diff % 3600) / 60);
            const seconds = diff % 60;

            // Format: "X Day, Y Jam, Z Menit, S Detik" 
            el.innerText = `Expires: ${days} Day, ${hours} Jam, ${minutes} Menit, ${seconds} Detik`;
        });
    }

    startExpiryTicker();

    // --- Auto-Check Pending Transactions ---
    async function checkPendingTransactions() {
        try {
            const response = await fetch('/api/fix-pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();

                // Check if any transactions were updated to success
                if (data.updated && data.updated.length > 0) {
                    // Show success notification
                    const successCount = data.updated.length;
                    showNotification(`✅ ${successCount} Payment Success!`, 'success');

                    // Reload page after 2 seconds to show updated status
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking pending transactions:', error);
        }
    }

    // Show notification function
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 10000;
            font-weight: 600;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // Run check on page load
    checkPendingTransactions();

    // Also check every 10 seconds if there are pending transactions visible
    setInterval(() => {
        const hasPending = document.querySelector('[class*="pending"]');
        if (hasPending) {
            checkPendingTransactions();
        }
    }, 10000);

});
