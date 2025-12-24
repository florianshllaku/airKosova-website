// Multi-language translations for AirKosova
// Languages: Albanian (sq) - default, English (en), German (de)

const translations = {
    sq: {
        // Navigation
        nav_home: 'Ballina',
        nav_book: 'Rezervo',
        nav_info: 'Informacione',
        nav_contact: 'Kontakti',
        nav_login: 'Hyr',
        nav_logout: 'Dil',
        
        // Top bar
        login: 'HYR',
        logout: 'Dil',
        
        // Tabs
        tab_flights: 'FLUTURIMET',
        tab_login: 'HYR',
        
        // Flight search form
        departure: 'Nisja:',
        departure_placeholder: 'Nisja nga',
        destination: 'Destinacioni:',
        destination_placeholder: 'Destinacioni',
        departure_date: 'Nisja më:',
        return_date: 'Kthimi më:',
        adults: 'Të rritur:',
        children: 'Fëmijë:',
        infants: 'Foshnjë:',
        roundtrip: 'Nisje dhe Kthim',
        oneway: 'Njëdrejtimshe',
        search_flight: 'KËRKONI FLUTURIMIN',
        payment_text: 'Të gjitha çmimet shfaqen dhe faturohen në EUR.',
        
        // Login form
        login_email: 'Email:',
        login_password: 'Fjalëkalimi:',
        login_button: 'HYR',
        login_forgot: 'Keni harruar fjalëkalimin?',
        login_no_account: 'Nuk keni llogari?',
        login_register: 'Regjistrohu',
        login_error_email: 'Email-i nuk është i vlefshëm',
        login_error_password: 'Fjalëkalimi nuk është i saktë',
        login_error_generic: 'Email ose fjalëkalimi nuk është i saktë',
        login_success: 'Hyrja u krye me sukses!',
        login_loading: 'Duke hyrë...',
        
        // Register page
        register_title: 'Regjistrimi',
        register_subtitle: 'Plotësoni të dhënat tuaja për të vazhduar',
        register_phone: 'Numri i Telefonit',
        register_prefix: 'Prefix',
        register_salutation: 'Thirrja',
        register_mr: 'Z.',
        register_mrs: 'Znj.',
        register_firstname: 'Emri',
        register_lastname: 'Mbiemri',
        register_password: 'Fjalëkalimi',
        register_confirm_password: 'Konfirmo Fjalëkalimin',
        register_terms: 'Pajtohem me',
        register_terms_link: 'Kushtet dhe Termat',
        register_button: 'Regjistrohu dhe Vazhdo',
        register_have_account: 'Keni llogari?',
        register_login_here: 'Hyni këtu',
        
        // Forgot password
        forgot_title: 'Keni harruar fjalëkalimin?',
        forgot_subtitle: 'Shkruani email-in tuaj dhe do t\'ju dërgojmë një link për të rivendosur fjalëkalimin.',
        forgot_button: 'Dërgo Linkun',
        forgot_success: 'Email-i u dërgua me sukses! Kontrolloni inbox-in tuaj.',
        forgot_back: 'Kthehu te faqja e hyrjes',
        
        // Passengers page
        passengers_title: 'Të Dhënat e Pasagjerëve',
        passengers_subtitle: 'Plotësoni të dhënat për çdo pasagjer',
        passenger: 'Pasagjeri',
        passenger_adult: 'I rritur',
        passenger_child: 'Fëmijë',
        passenger_infant: 'Bebe',
        passenger_name_note: '(siç shkruhet në pasaportë)',
        birth_date: 'Data e Lindjes',
        nationality: 'Shtetësia',
        contact_title: 'Kontakti për Rezervim',
        continue_payment: 'Vazhdo me Pagesën',
        
        // Booking summary
        booking_summary: 'Rezervimi Juaj',
        total_price: 'Çmimi Total',
        total: 'Totali',
        
        // Flights page
        searching: 'Duke kërkuar fluturime...',
        search_subtitle: 'Ju lutemi prisni ndërsa kërkojmë çmimet më të mira',
        outbound_flight: 'Fluturimi i Nisjes',
        return_flight: 'Fluturimi i Kthimit',
        direct: 'Direkt',
        select: 'Zgjidh',
        selected: 'Zgjedhur',
        book_now: 'Rezervo Tani',
        modify_search: 'Ndrysho',
        
        // Footer
        footer_rights: '© 2025 AirKosova - Të gjitha të drejtat e rezervuara',
        
        // Common
        back: 'Kthehu',
        loading: 'Duke ngarkuar...',
        error: 'Gabim',
        success: 'Sukses',
    },
    
    en: {
        // Navigation
        nav_home: 'Home',
        nav_book: 'Book',
        nav_info: 'Information',
        nav_contact: 'Contact',
        nav_login: 'Login',
        nav_logout: 'Logout',
        
        // Top bar
        login: 'LOGIN',
        logout: 'Logout',
        
        // Tabs
        tab_flights: 'FLIGHTS',
        tab_login: 'LOGIN',
        
        // Flight search form
        departure: 'From:',
        departure_placeholder: 'Departure from',
        destination: 'To:',
        destination_placeholder: 'Destination',
        departure_date: 'Departure:',
        return_date: 'Return:',
        adults: 'Adults:',
        children: 'Children:',
        infants: 'Infants:',
        roundtrip: 'Round Trip',
        oneway: 'One Way',
        search_flight: 'SEARCH FLIGHTS',
        payment_text: 'All prices are displayed and billed in EUR.',
        
        // Login form
        login_email: 'Email:',
        login_password: 'Password:',
        login_button: 'LOGIN',
        login_forgot: 'Forgot your password?',
        login_no_account: 'Don\'t have an account?',
        login_register: 'Register',
        login_error_email: 'Email is not valid',
        login_error_password: 'Password is incorrect',
        login_error_generic: 'Email or password is incorrect',
        login_success: 'Login successful!',
        login_loading: 'Logging in...',
        
        // Register page
        register_title: 'Registration',
        register_subtitle: 'Fill in your details to continue',
        register_phone: 'Phone Number',
        register_prefix: 'Prefix',
        register_salutation: 'Title',
        register_mr: 'Mr.',
        register_mrs: 'Mrs.',
        register_firstname: 'First Name',
        register_lastname: 'Last Name',
        register_password: 'Password',
        register_confirm_password: 'Confirm Password',
        register_terms: 'I agree to the',
        register_terms_link: 'Terms and Conditions',
        register_button: 'Register and Continue',
        register_have_account: 'Have an account?',
        register_login_here: 'Login here',
        
        // Forgot password
        forgot_title: 'Forgot your password?',
        forgot_subtitle: 'Enter your email and we will send you a link to reset your password.',
        forgot_button: 'Send Link',
        forgot_success: 'Email sent successfully! Check your inbox.',
        forgot_back: 'Back to login',
        
        // Passengers page
        passengers_title: 'Passenger Details',
        passengers_subtitle: 'Fill in details for each passenger',
        passenger: 'Passenger',
        passenger_adult: 'Adult',
        passenger_child: 'Child',
        passenger_infant: 'Infant',
        passenger_name_note: '(as shown on passport)',
        birth_date: 'Date of Birth',
        nationality: 'Nationality',
        contact_title: 'Booking Contact',
        continue_payment: 'Continue to Payment',
        
        // Booking summary
        booking_summary: 'Your Booking',
        total_price: 'Total Price',
        total: 'Total',
        
        // Flights page
        searching: 'Searching for flights...',
        search_subtitle: 'Please wait while we find the best prices',
        outbound_flight: 'Outbound Flight',
        return_flight: 'Return Flight',
        direct: 'Direct',
        select: 'Select',
        selected: 'Selected',
        book_now: 'Book Now',
        modify_search: 'Modify',
        
        // Footer
        footer_rights: '© 2025 AirKosova - All rights reserved',
        
        // Common
        back: 'Back',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
    },
    
    de: {
        // Navigation
        nav_home: 'Startseite',
        nav_book: 'Buchen',
        nav_info: 'Informationen',
        nav_contact: 'Kontakt',
        nav_login: 'Anmelden',
        nav_logout: 'Abmelden',
        
        // Top bar
        login: 'ANMELDEN',
        logout: 'Abmelden',
        
        // Tabs
        tab_flights: 'FLÜGE',
        tab_login: 'ANMELDEN',
        
        // Flight search form
        departure: 'Von:',
        departure_placeholder: 'Abflug von',
        destination: 'Nach:',
        destination_placeholder: 'Ziel',
        departure_date: 'Hinflug:',
        return_date: 'Rückflug:',
        adults: 'Erwachsene:',
        children: 'Kinder:',
        infants: 'Kleinkinder:',
        roundtrip: 'Hin- und Rückflug',
        oneway: 'Nur Hinflug',
        search_flight: 'FLÜGE SUCHEN',
        payment_text: 'Alle Preise werden in EUR angezeigt und abgerechnet.',
        
        // Login form
        login_email: 'E-Mail:',
        login_password: 'Passwort:',
        login_button: 'ANMELDEN',
        login_forgot: 'Passwort vergessen?',
        login_no_account: 'Noch kein Konto?',
        login_register: 'Registrieren',
        login_error_email: 'E-Mail ist ungültig',
        login_error_password: 'Passwort ist falsch',
        login_error_generic: 'E-Mail oder Passwort ist falsch',
        login_success: 'Anmeldung erfolgreich!',
        login_loading: 'Anmelden...',
        
        // Register page
        register_title: 'Registrierung',
        register_subtitle: 'Füllen Sie Ihre Daten aus, um fortzufahren',
        register_phone: 'Telefonnummer',
        register_prefix: 'Vorwahl',
        register_salutation: 'Anrede',
        register_mr: 'Herr',
        register_mrs: 'Frau',
        register_firstname: 'Vorname',
        register_lastname: 'Nachname',
        register_password: 'Passwort',
        register_confirm_password: 'Passwort bestätigen',
        register_terms: 'Ich stimme den',
        register_terms_link: 'AGB zu',
        register_button: 'Registrieren und Fortfahren',
        register_have_account: 'Haben Sie ein Konto?',
        register_login_here: 'Hier anmelden',
        
        // Forgot password
        forgot_title: 'Passwort vergessen?',
        forgot_subtitle: 'Geben Sie Ihre E-Mail ein und wir senden Ihnen einen Link zum Zurücksetzen.',
        forgot_button: 'Link senden',
        forgot_success: 'E-Mail erfolgreich gesendet! Überprüfen Sie Ihren Posteingang.',
        forgot_back: 'Zurück zur Anmeldung',
        
        // Passengers page
        passengers_title: 'Passagierdaten',
        passengers_subtitle: 'Füllen Sie die Daten für jeden Passagier aus',
        passenger: 'Passagier',
        passenger_adult: 'Erwachsener',
        passenger_child: 'Kind',
        passenger_infant: 'Kleinkind',
        passenger_name_note: '(wie im Reisepass)',
        birth_date: 'Geburtsdatum',
        nationality: 'Staatsangehörigkeit',
        contact_title: 'Buchungskontakt',
        continue_payment: 'Weiter zur Zahlung',
        
        // Booking summary
        booking_summary: 'Ihre Buchung',
        total_price: 'Gesamtpreis',
        total: 'Gesamt',
        
        // Flights page
        searching: 'Flüge werden gesucht...',
        search_subtitle: 'Bitte warten Sie, während wir die besten Preise finden',
        outbound_flight: 'Hinflug',
        return_flight: 'Rückflug',
        direct: 'Direkt',
        select: 'Auswählen',
        selected: 'Ausgewählt',
        book_now: 'Jetzt buchen',
        modify_search: 'Ändern',
        
        // Footer
        footer_rights: '© 2025 AirKosova - Alle Rechte vorbehalten',
        
        // Common
        back: 'Zurück',
        loading: 'Laden...',
        error: 'Fehler',
        success: 'Erfolg',
    }
};

// Get translation by key
function t(lang, key) {
    const language = translations[lang] || translations['sq'];
    return language[key] || translations['sq'][key] || key;
}

// Get all translations for a language
function getTranslations(lang) {
    return translations[lang] || translations['sq'];
}

module.exports = {
    translations,
    t,
    getTranslations
};




