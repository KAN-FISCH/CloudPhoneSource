// Auto-refresh device screenshots every 2 seconds
(function () {
    const REFRESH_INTERVAL = 2000; // 2 seconds

    function refreshScreenshots() {
        const deviceCards = document.querySelectorAll('.device-preview-card');

        deviceCards.forEach(card => {
            const img = card.querySelector('.device-screenshot-bg');
            if (!img) return;

            // Get current src without timestamp
            const currentSrc = img.src.split('&t=')[0];

            // Add cache buster timestamp
            const newSrc = `${currentSrc}&t=${Date.now()}`;

            // Update image src to force reload
            img.src = newSrc;
        });
    }

    // Start auto-refresh when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🔄 Screenshot auto-refresh enabled (2s interval)');

        // Refresh every 2 seconds
        setInterval(refreshScreenshots, REFRESH_INTERVAL);
    });
})();
