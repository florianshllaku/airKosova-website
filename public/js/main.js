/**
 * AirKosova - Main JavaScript
 * Minimal, smooth interactions with mobile support
 */

// Detect mobile/touch device
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// DOM Elements
const departureWrapper = document.getElementById('departureWrapper');
const departureDisplay = document.getElementById('departureDisplay');
const departureDropdown = document.getElementById('departureDropdown');
const departureInput = document.getElementById('departure');

const destinationWrapper = document.getElementById('destinationWrapper');
const destinationDisplay = document.getElementById('destinationDisplay');
const destinationDropdown = document.getElementById('destinationDropdown');
const destinationInput = document.getElementById('destination');

const departureDateInput = document.getElementById('departureDate');
const returnDateInput = document.getElementById('returnDate');
const returnDateGroup = document.getElementById('returnDateGroup');
const flightSearchForm = document.getElementById('flightSearchForm');
const tripTypeRadios = document.querySelectorAll('input[name="tripType"]');
const tabs = document.querySelectorAll('.form-tab');
const languageButtons = document.querySelectorAll('.language-selector span');

// Set default dates (today and 10 days from now)
function setDefaultDates() {
    const today = new Date();
    const returnDate = new Date(today);
    returnDate.setDate(today.getDate() + 10);
    
    departureDateInput.value = formatDate(today);
    returnDateInput.value = formatDate(returnDate);
    
    // Set minimum dates
    departureDateInput.min = formatDate(today);
    returnDateInput.min = formatDate(today);
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Custom Select functionality with smooth animations and mobile support
function initCustomSelect(wrapper, display, dropdown, input, isDestination = false) {
    if (!wrapper || !display || !dropdown) return;
    
    // Toggle dropdown with animation - support both touch and click
    const toggleDropdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Close other dropdowns first
        document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== wrapper) {
                el.classList.remove('open');
            }
        });
        
        wrapper.classList.toggle('open');
        
        // On mobile, scroll dropdown into view
        if (isTouchDevice && wrapper.classList.contains('open')) {
            setTimeout(() => {
                dropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    };
    
    // Use touchend for mobile, click for desktop
    if (isTouchDevice) {
        display.addEventListener('touchend', toggleDropdown, { passive: false });
    }
    display.addEventListener('click', toggleDropdown);

    // Handle option selection with smooth feedback
    const selectOption = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const option = e.target.closest('.select-option');
        if (!option) return;

        const value = option.dataset.value;
        
        // Update display with subtle animation
        display.style.opacity = '0';
        setTimeout(() => {
            display.textContent = value;
            display.classList.remove('placeholder');
            display.style.opacity = '1';
        }, 100);
        
        // Update hidden input
        input.value = value;

        // Mark as selected
        dropdown.querySelectorAll('.select-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Close dropdown
        wrapper.classList.remove('open');

        // If departure changed, update destinations
        if (!isDestination) {
            updateDestinations(value);
        }
    };
    
    // Use touchend for mobile, click for desktop
    if (isTouchDevice) {
        dropdown.addEventListener('touchend', selectOption, { passive: false });
    }
    dropdown.addEventListener('click', selectOption);
}

// Fetch destinations from API based on departure city
async function updateDestinations(departureCity) {
    if (!destinationDropdown || !destinationDisplay) return;
    
    // Clear current destinations with fade
    destinationDropdown.style.opacity = '0';
    
    setTimeout(async () => {
        destinationDropdown.innerHTML = '';
        const originalPlaceholder = destinationDisplay.dataset.placeholder || destinationDisplay.textContent;
        destinationDisplay.textContent = originalPlaceholder;
        destinationDisplay.classList.add('placeholder');
        destinationInput.value = '';
        
        if (!departureCity) {
            destinationDropdown.style.opacity = '1';
            return;
        }
        
        try {
            const response = await fetch(`/api/destinations/${encodeURIComponent(departureCity)}`);
            const data = await response.json();
            
            data.destinations.forEach(dest => {
                const option = document.createElement('div');
                option.className = 'select-option';
                option.dataset.value = dest.name;
                option.dataset.code = dest.code;
                option.textContent = `${dest.name} (${dest.code})`;
                destinationDropdown.appendChild(option);
            });

            // Auto-select Basel if available (for Prishtina default)
            if (departureCity === 'Prishtina') {
                const baselOption = destinationDropdown.querySelector('[data-value="Basel"]');
                if (baselOption) {
                    setTimeout(() => baselOption.click(), 200);
                }
            }
        } catch (error) {
            console.error('Error fetching destinations:', error);
        }
        
        destinationDropdown.style.opacity = '1';
    }, 150);
}

// Set default selection (Prishtina to Basel)
function setDefaultSelection() {
    if (!departureDropdown) return;
    
    const prishtina = departureDropdown.querySelector('[data-value="Prishtina"]');
    if (prishtina) {
        prishtina.click();
    }
}

// Handle trip type change with smooth animation
function handleTripTypeChange() {
    const tripType = document.querySelector('input[name="tripType"]:checked');
    if (!tripType || !returnDateGroup) return;
    
    if (tripType.value === 'oneway') {
        returnDateGroup.style.opacity = '0';
        returnDateGroup.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            returnDateGroup.style.display = 'none';
        }, 200);
        returnDateInput.required = false;
    } else {
        returnDateGroup.style.display = 'block';
        setTimeout(() => {
            returnDateGroup.style.opacity = '1';
            returnDateGroup.style.transform = 'translateY(0)';
        }, 10);
        returnDateInput.required = true;
    }
}

// Handle form submission with loading state
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = {
        departure: departureInput.value,
        destination: destinationInput.value,
        departureDate: departureDateInput.value,
        returnDate: returnDateInput.value,
        adults: document.getElementById('adults').value,
        children: document.getElementById('children').value,
        infants: document.getElementById('infants').value,
        tripType: document.querySelector('input[name="tripType"]:checked').value
    };
    
    // Validation with subtle shake animation
    if (!formData.departure || !formData.destination) {
        shakeElement(document.querySelector('.booking-form'));
        return;
    }
    
    if (!formData.departureDate) {
        shakeElement(departureDateInput);
        return;
    }
    
    if (formData.tripType === 'roundtrip' && !formData.returnDate) {
        shakeElement(returnDateInput);
        return;
    }
    
    // Show loading state
    const searchBtn = document.querySelector('.search-btn');
    const originalContent = searchBtn.innerHTML;
    searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duke kërkuar...';
    searchBtn.classList.add('loading');
    
    // Build query string and redirect to flights page
    const params = new URLSearchParams({
        departure: formData.departure,
        destination: formData.destination,
        departureDate: formData.departureDate,
        returnDate: formData.returnDate || '',
        adults: formData.adults,
        children: formData.children,
        infants: formData.infants,
        tripType: formData.tripType
    });
    
    // Smooth transition to flights page
    document.body.style.opacity = '0';
    setTimeout(() => {
        window.location.href = `/flights?${params.toString()}`;
    }, 200);
}

// Subtle shake animation for validation
function shakeElement(element) {
    if (!element) return;
    
    element.style.animation = 'shake 0.4s ease';
    element.addEventListener('animationend', () => {
        element.style.animation = '';
    }, { once: true });
}

// Add shake keyframes dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-4px); }
        40% { transform: translateX(4px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
    }
`;
document.head.appendChild(style);

// Tab switching with smooth transition
function handleTabSwitch(e) {
    tabs.forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    const tabType = e.currentTarget.dataset.tab;
    const loginForm = document.getElementById('loginForm');
    const flightForm = document.getElementById('flightSearchForm');
    
    if (tabType === 'login') {
        if (flightForm) {
            flightForm.style.opacity = '0';
            setTimeout(() => {
                flightForm.classList.add('hidden');
                if (loginForm) {
                    loginForm.classList.add('active');
                    loginForm.style.opacity = '0';
                    setTimeout(() => {
                        loginForm.style.opacity = '1';
                    }, 10);
                }
            }, 150);
        }
    } else {
        if (loginForm) {
            loginForm.style.opacity = '0';
            setTimeout(() => {
                loginForm.classList.remove('active');
                if (flightForm) {
                    flightForm.classList.remove('hidden');
                    flightForm.style.opacity = '0';
                    setTimeout(() => {
                        flightForm.style.opacity = '1';
                    }, 10);
                }
            }, 150);
        }
    }
}

// Language switching
function handleLanguageSwitch(e) {
    const lang = e.currentTarget.dataset.lang;
    languageButtons.forEach(btn => btn.classList.remove('active'));
    e.currentTarget.classList.add('active');
}

// Update return date minimum when departure date changes
function handleDepartureDateChange() {
    if (departureDateInput && departureDateInput.value && returnDateInput) {
        returnDateInput.min = departureDateInput.value;
        
        if (returnDateInput.value && returnDateInput.value < departureDateInput.value) {
            const newReturn = new Date(departureDateInput.value);
            newReturn.setDate(newReturn.getDate() + 10);
            returnDateInput.value = formatDate(newReturn);
        }
    }
}

// Close dropdowns when clicking/touching outside
function closeDropdowns(e) {
    if (!e.target.closest('.custom-select')) {
        document.querySelectorAll('.custom-select.open').forEach(el => {
            el.classList.remove('open');
        });
    }
}

document.addEventListener('click', closeDropdowns);
if (isTouchDevice) {
    document.addEventListener('touchend', closeDropdowns);
}

// Mobile hamburger menu toggle
function initMobileMenu() {
    const hamburger = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileOverlay = document.getElementById('mobileOverlay');
    
    if (!hamburger || !mobileMenu) return;
    
    const toggleMenu = () => {
        hamburger.classList.toggle('active');
        mobileMenu.classList.toggle('open');
        mobileOverlay.classList.toggle('show');
        document.body.classList.toggle('menu-open');
    };
    
    hamburger.addEventListener('click', toggleMenu);
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', toggleMenu);
    }
    
    // Close menu when clicking a link
    mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            mobileMenu.classList.remove('open');
            mobileOverlay.classList.remove('show');
            document.body.classList.remove('menu-open');
        });
    });
}

// Lazy load images with IntersectionObserver
function initLazyLoading() {
    const lazyImages = document.querySelectorAll('.destination-image[data-bg]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const bgUrl = img.dataset.bg;
                    
                    // Create a new image to preload
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        img.style.backgroundImage = `url('${bgUrl}')`;
                        img.classList.add('loaded');
                    };
                    tempImg.src = bgUrl;
                    
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '100px 0px', // Start loading 100px before visible
            threshold: 0.01
        });
        
        lazyImages.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for older browsers
        lazyImages.forEach(img => {
            img.style.backgroundImage = `url('${img.dataset.bg}')`;
            img.classList.add('loaded');
        });
    }
}

// Smooth page load transition
document.addEventListener('DOMContentLoaded', () => {
    // Fade in page
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';
    
    requestAnimationFrame(() => {
        document.body.style.opacity = '1';
    });
    
    // Initialize custom selects
    if (departureWrapper && departureDisplay && departureDropdown) {
        initCustomSelect(departureWrapper, departureDisplay, departureDropdown, departureInput, false);
    }
    
    if (destinationWrapper && destinationDisplay && destinationDropdown) {
        initCustomSelect(destinationWrapper, destinationDisplay, destinationDropdown, destinationInput, true);
    }
    
    // Set defaults
    if (departureDateInput && returnDateInput) {
        setDefaultDates();
    }
    
    handleTripTypeChange();
    
    // Set default Prishtina -> Basel after a small delay
    setTimeout(setDefaultSelection, 100);
    
    // Add transition styles to return date group
    if (returnDateGroup) {
        returnDateGroup.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    }
    
    // Initialize mobile menu
    initMobileMenu();
    
    // Initialize lazy loading for images
    initLazyLoading();
});

// Event Listeners
if (tripTypeRadios) {
    tripTypeRadios.forEach(radio => radio.addEventListener('change', handleTripTypeChange));
}

if (flightSearchForm) {
    flightSearchForm.addEventListener('submit', handleFormSubmit);
}

if (tabs) {
    tabs.forEach(tab => tab.addEventListener('click', handleTabSwitch));
}

if (languageButtons) {
    languageButtons.forEach(btn => btn.addEventListener('click', handleLanguageSwitch));
}

if (departureDateInput) {
    departureDateInput.addEventListener('change', handleDepartureDateChange);
}

// Add smooth transitions to forms
const forms = document.querySelectorAll('.booking-form, .login-form');
forms.forEach(form => {
    form.style.transition = 'opacity 0.15s ease';
});
