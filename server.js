require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { searchFlights, airportCodes } = require('./services/flightScraper');
const { supabase } = require('./config/supabase');
const { getTranslations } = require('./config/translations');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Language middleware - set language from cookie or default to Albanian
app.use((req, res, next) => {
    const lang = req.cookies.lang || 'sq'; // Default to Albanian
    req.lang = lang;
    res.locals.lang = lang;
    res.locals.t = getTranslations(lang);
    next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Cities with airport codes
const cities = {
    "Prishtina": "PRN",
    "Stockholm": "ARN",
    "Berlin Brandenburg": "BER",
    "Milano Bergamo": "BGY",
    "Bremen": "BRE",
    "Brussels": "BRU",
    "Basel": "BSL",
    "Köln/Bonn": "CGN",
    "Dortmund": "DTM",
    "Düsseldorf": "DUS",
    "Memmingen": "FMM",
    "Münster-Osnabrück": "FMO",
    "Göteborg Landvetter": "GOT",
    "Geneva": "GVA",
    "Hannover": "HAJ",
    "Hamburg": "HAM",
    "Helsinki": "HEL",
    "Ljubljana": "LJU",
    "Luxembourg": "LUX",
    "Malmö": "MMX",
    "München": "MUC",
    "Nürnberg": "NUE",
    "Oslo": "OSL",
    "Stuttgart": "STR",
    "Salzburg": "SZG",
    "Vienna": "VIE",
    "Växjö-Småland": "VXO",
    "Zürich": "ZRH"
};

// Flight routes data - departure city -> available destinations
const flightRoutes = {
    "Prishtina": [
        "Basel", "Stockholm", "Berlin Brandenburg", "Milano Bergamo", "Bremen", "Brussels",
        "Köln/Bonn", "Dortmund", "Düsseldorf", "Memmingen", "Münster-Osnabrück",
        "Göteborg Landvetter", "Geneva", "Hannover", "Hamburg", "Helsinki",
        "Ljubljana", "Luxembourg", "Malmö", "München", "Nürnberg", "Oslo",
        "Stuttgart", "Salzburg", "Vienna", "Växjö-Småland", "Zürich"
    ],
    "Stockholm": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Berlin Brandenburg": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Milano Bergamo": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Bremen": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Brussels": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Basel": [
        "Stockholm", "Berlin Brandenburg", "Milano Bergamo", "Bremen", "Brussels", "Köln/Bonn",
        "Dortmund", "Düsseldorf", "Memmingen", "Münster-Osnabrück",
        "Göteborg Landvetter", "Hannover", "Hamburg", "Helsinki", "Ljubljana",
        "Luxembourg", "Malmö", "München", "Nürnberg", "Oslo", "Prishtina",
        "Stuttgart", "Salzburg", "Vienna", "Växjö-Småland"
    ],
    "Köln/Bonn": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Dortmund": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Düsseldorf": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Memmingen": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Münster-Osnabrück": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Göteborg Landvetter": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Geneva": [
        "Stockholm", "Berlin Brandenburg", "Milano Bergamo", "Bremen", "Brussels", "Köln/Bonn",
        "Dortmund", "Düsseldorf", "Memmingen", "Münster-Osnabrück",
        "Göteborg Landvetter", "Hannover", "Hamburg", "Helsinki", "Ljubljana",
        "Luxembourg", "Malmö", "München", "Nürnberg", "Oslo", "Prishtina",
        "Stuttgart", "Salzburg", "Vienna", "Växjö-Småland"
    ],
    "Hannover": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Hamburg": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Helsinki": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Ljubljana": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Luxembourg": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Malmö": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "München": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Nürnberg": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Oslo": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Stuttgart": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Salzburg": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Vienna": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Växjö-Småland": ["Basel", "Geneva", "Prishtina", "Zürich"],
    "Zürich": [
        "Stockholm", "Berlin Brandenburg", "Milano Bergamo", "Bremen", "Brussels",
        "Köln/Bonn", "Dortmund", "Düsseldorf", "Memmingen", "Münster-Osnabrück",
        "Göteborg Landvetter", "Hannover", "Hamburg", "Helsinki", "Ljubljana",
        "Luxembourg", "Malmö", "München", "Nürnberg", "Oslo", "Prishtina",
        "Stuttgart", "Salzburg", "Vienna", "Växjö-Småland"
    ]
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { flightRoutes, cities });
});

// Flight results page
app.get('/flights', (req, res) => {
    res.render('flights', { 
        flightRoutes, 
        cities,
        searchParams: req.query
    });
});

// Auth page (login)
app.get('/auth', (req, res) => {
    res.render('auth', { cities });
});

// Register page
app.get('/register', (req, res) => {
    res.render('register', { cities });
});

// Forgot password page
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { cities });
});

// Booking passengers page
app.get('/booking/passengers', (req, res) => {
    res.render('passengers', { cities });
});

// Info pages
const infoPages = {
    'siguria': 'Siguria',
    'para-udhetimit': 'Para Udhëtimit',
    'e-biletat': 'E-Biletat',
    'bagazhi': 'Bagazhi',
    'shendeti': 'Shëndeti'
};

app.get('/info/:section', (req, res) => {
    const section = req.params.section;
    const pageTitle = infoPages[section] || 'Informacione';
    
    if (!infoPages[section]) {
        return res.redirect('/info/siguria');
    }
    
    res.render('info', { 
        section,
        pageTitle,
        cities 
    });
});

// Contact page
app.get('/contact', (req, res) => {
    res.render('contact', { cities });
});

// Language switching endpoint
app.get('/api/lang/:lang', (req, res) => {
    const lang = req.params.lang;
    const validLangs = ['sq', 'en', 'de'];
    
    if (validLangs.includes(lang)) {
        res.cookie('lang', lang, { 
            maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
            httpOnly: true 
        });
        res.json({ success: true, lang });
    } else {
        res.json({ success: false, message: 'Invalid language' });
    }
});

// API endpoint to get destinations for a departure city
app.get('/api/destinations/:city', (req, res) => {
    const city = req.params.city;
    const destinations = flightRoutes[city] || [];
    // Return destinations with their codes
    const destinationsWithCodes = destinations.sort().map(dest => ({
        name: dest,
        code: cities[dest] || ''
    }));
    res.json({ destinations: destinationsWithCodes });
});

// API endpoint to get all departure cities
app.get('/api/departures', (req, res) => {
    const departures = Object.keys(flightRoutes).sort().map(city => ({
        name: city,
        code: cities[city] || ''
    }));
    res.json({ departures });
});

// Search flights endpoint - triggers real scraping
app.post('/api/search', async (req, res) => {
    const { departure, destination, departureDate, returnDate, adults, children, infants, tripType } = req.body;
    
    console.log('🔍 Flight search request:', { departure, destination, departureDate, returnDate, adults, children, infants, tripType });
    
    try {
        // Call the scraper
        const results = await searchFlights({
            departure,
            destination,
            departureDate,
            returnDate,
            adults,
            children,
            infants,
            tripType
        });
        
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// AUTH API ENDPOINTS
// ========================================

// Register user
app.post('/api/auth/register', async (req, res) => {
    const { email, password, phonePrefix, phoneNumber, salutation, firstName, lastName } = req.body;
    
    console.log('📝 Registration attempt:', email);
    console.log('📝 Registration data:', { email, phonePrefix, phoneNumber, salutation, firstName, lastName });
    
    try {
        // Register with Supabase Auth
        console.log('🔄 Calling Supabase signUp...');
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    phone_prefix: phonePrefix,
                    phone_number: phoneNumber,
                    salutation,
                    first_name: firstName,
                    last_name: lastName
                },
                emailRedirectTo: undefined // Disable email confirmation for development
            }
        });
        
        console.log('📦 Supabase signUp response:', { 
            user: authData?.user ? { id: authData.user.id, email: authData.user.email } : null,
            session: authData?.session ? 'exists' : 'null',
            error: authError 
        });
        
        if (authError) {
            console.error('❌ Auth error:', authError);
            return res.json({ 
                success: false, 
                message: authError.message || 'Regjistrimi dështoi'
            });
        }
        
        // Check if user was created
        if (!authData?.user) {
            console.error('❌ No user returned from signUp');
            return res.json({
                success: false,
                message: 'Regjistrimi dështoi - nuk u krijua përdoruesi'
            });
        }
        
        console.log('✅ User created in Supabase Auth:', authData.user.id);
        
        // Check if email confirmation is required
        if (authData.user && !authData.session) {
            console.log('📧 Email confirmation may be required. User created but no session.');
        }
        
        // Store user profile in database table
        console.log('🔄 Storing user profile in database...');
        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                id: authData.user.id,
                email,
                phone_prefix: phonePrefix,
                phone_number: phoneNumber,
                salutation,
                first_name: firstName,
                last_name: lastName,
                created_at: new Date().toISOString()
            })
            .select();
        
        if (profileError) {
            console.error('⚠️ Profile insert error:', profileError);
            console.error('   This might be because the user_profiles table does not exist.');
            console.error('   Create it in Supabase SQL Editor with:');
            console.error(`
   CREATE TABLE IF NOT EXISTS user_profiles (
       id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
       email TEXT,
       phone_prefix TEXT,
       phone_number TEXT,
       salutation TEXT,
       first_name TEXT,
       last_name TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Enable Row Level Security
   ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
   
   -- Allow users to read/write their own profile
   CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
   CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
   CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
            `);
            // Continue anyway - the auth user is created
        } else {
            console.log('✅ User profile stored:', profileData);
        }
        
        // Store in session
        req.session.user = {
            id: authData.user.id,
            email,
            firstName,
            lastName,
            salutation,
            phonePrefix,
            phoneNumber
        };
        
        res.json({
            success: true,
            user: req.session.user,
            message: 'Regjistrimi u krye me sukses!'
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.json({ 
            success: false, 
            message: 'Ndodhi një gabim gjatë regjistrimit: ' + error.message
        });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) {
            console.error('Login error:', error);
            return res.json({ 
                success: false, 
                message: 'Email ose fjalëkalimi nuk është i saktë'
            });
        }
        
        // Get user profile
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        // Store in session
        req.session.user = {
            id: data.user.id,
            email: data.user.email,
            firstName: profile?.first_name || '',
            lastName: profile?.last_name || '',
            salutation: profile?.salutation || '',
            phonePrefix: profile?.phone_prefix || '',
            phoneNumber: profile?.phone_number || ''
        };
        
        res.json({
            success: true,
            user: req.session.user
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.json({ 
            success: false, 
            message: 'Ndodhi një gabim. Ju lutemi provoni përsëri.'
        });
    }
});

// Logout user
app.post('/api/auth/logout', async (req, res) => {
    try {
        await supabase.auth.signOut();
        req.session.destroy();
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// Get current user
app.get('/api/auth/user', (req, res) => {
    if (req.session.user) {
        res.json({ success: true, user: req.session.user });
    } else {
        res.json({ success: false, user: null });
    }
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    console.log('🔑 Password reset request for:', email);
    
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${req.protocol}://${req.get('host')}/reset-password`
        });
        
        if (error) {
            console.error('Password reset error:', error);
        }
        
        // Always return success for security (don't reveal if email exists)
        res.json({ 
            success: true, 
            message: 'Nëse email-i ekziston, do të merrni një link për rivendosjen e fjalëkalimit.'
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.json({ 
            success: true, 
            message: 'Nëse email-i ekziston, do të merrni një link për rivendosjen e fjalëkalimit.'
        });
    }
});

// ========================================
// OTHER API ENDPOINTS
// ========================================

// Quick search endpoint (returns URL to redirect to prishtinaticket.net)
app.get('/api/quick-search', (req, res) => {
    const { from, to, dateFrom, dateTo, adults = 1, children = 0, infants = 0, tripType = 'ROUND_TRIP' } = req.query;
    
    const fromCode = cities[from] || from;
    const toCode = cities[to] || to;
    
    // Format dates (convert from YYYY-MM-DD to DD.MM.YYYY)
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}.${month}.${year}`;
    };
    
    const url = `https://www.prishtinaticket.net/en/flights/booking?FLIGHT_TYPE=${tripType}&FROM=${fromCode}&TO=${toCode}&DATE_FROM=${formatDate(dateFrom)}&DATE_TO=${formatDate(dateTo)}&ADULTS=${adults}&CHILDREN=${children}&INFANTS=${infants}`;
    
    res.json({ url });
});

// Start server
app.listen(PORT, () => {
    console.log(`🛫 AirKosova server running at http://localhost:${PORT}`);
});
