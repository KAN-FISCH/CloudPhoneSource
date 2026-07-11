document.addEventListener('DOMContentLoaded', () => {

    // --- Mobile Menu Toggle (Index) ---
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const navActions = document.querySelector('.nav-actions');

    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            mobileBtn.classList.toggle('active');
            if (navLinks) navLinks.classList.toggle('active');
            if (navActions) navActions.classList.toggle('active');
        });
    }

    // --- Smooth Scroll (Index) ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            // Skip if it's just a placeholder or navigating to another page's hash
            if (href === '#' || href.includes('.html') || href.startsWith('/')) return;

            const targetElement = document.querySelector(href);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });

                // Close mobile menu on click
                if (mobileBtn) {
                    mobileBtn.classList.remove('active');
                    if (navLinks) navLinks.classList.remove('active');
                    if (navActions) navActions.classList.remove('active');
                }
            }
        });
    });

    // --- Authentication Logic (Login/Signup) ---

    // 1. Form Toggling
    const loginFormContainer = document.getElementById('login-form');
    const signupFormContainer = document.getElementById('signup-form');
    const toggleSignupBtn = document.getElementById('toggle-signup');
    const toggleLoginBtn = document.getElementById('toggle-login');

    if (loginFormContainer && signupFormContainer) {
        if (toggleSignupBtn) {
            toggleSignupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                loginFormContainer.classList.add('hidden');
                signupFormContainer.classList.remove('hidden');
                // Update URL hash for state
                history.pushState(null, null, '#signup');
            });
        }

        if (toggleLoginBtn) {
            toggleLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                signupFormContainer.classList.add('hidden');
                loginFormContainer.classList.remove('hidden');
                history.pushState(null, null, '#login');
            });
        }

        // Check Initial Hash
        if (window.location.hash === '#signup') {
            loginFormContainer.classList.add('hidden');
            signupFormContainer.classList.remove('hidden');
        }
    }

    // 2. Login Submission Redirect
    // Select the actual <form> inside the container
    const loginForm = loginFormContainer ? loginFormContainer.querySelector('form') : null;

    // Login logic is now handled by server-side form submission

    // 3. Signup Submission (Optional - redirects to dashboard too or login)
    const signupForm = signupFormContainer ? signupFormContainer.querySelector('form') : null;
    // Signup logic is now handled by server-side form submission

    // --- Show Password Toggle ---
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            // Toggle type
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);

            // Toggle Icon (Simple opacity change or SVG swap)
            // Let's swap the SVG to an "eye-off" or just change color/opacity to indicate state
            if (type === 'text') {
                togglePasswordBtn.style.color = '#2979ff'; // Active color
                // Optional: Change SVG path to eye-off here if desired, but color is good enough for MVP
            } else {
                togglePasswordBtn.style.color = 'currentColor';
            }
        });
    }

});
