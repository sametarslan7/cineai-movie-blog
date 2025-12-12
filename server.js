const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const Movie = require('./models/movie');

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

const dbURL = "mongodb+srv://sametarslan:sampersie29@cluster0.bwicwso.mongodb.net/MovieBlogDB?retryWrites=true&w=majority";
mongoose.connect(dbURL)
    .then(() => console.log('✅ CineAI Veritabanına Bağlandı'))
    .catch((err) => console.log('❌ Hata:', err));

// --- GLOBAL VERİLER (SIDEBAR İÇİN) ---
// --- GLOBAL VERİLER (SIDEBAR VE MENÜ İÇİN) ---
async function getGlobalData() {
    
    // 1. SABİT KATEGORİ LİSTESİ (Sadece bunları göstereceğiz)
    const uniqueGenres = [
        "Aksiyon", 
        "Bilim Kurgu", 
        "Dram", 
        "Komedi", 
        "Korku", 
        "Gerilim", 
        "Macera", 
        "Romantik", 
        "Fantastik", 
        "Animasyon"
    ].sort(); // Alfabetik sıraya soktuk

    // 2. En Çok Beğenilenler (Popüler)
    const topMovies = await Movie.find().sort({ likes: -1 }).limit(4);
    
    // 3. Rastgele 1 Film Önerisi
    const count = await Movie.countDocuments();
    let randomMovie = null;
    if (count > 0) {
        const random = Math.floor(Math.random() * count);
        randomMovie = await Movie.findOne().skip(random);
    }

    return { uniqueGenres, topMovies, randomMovie };
}

// --- ROTALAR ---

// ... (Üst kısımlar, importlar ve getGlobalData aynı kalsın) ...

// --- ROTALAR ---

// 1. ANA SAYFA (SLIDER + SAYFALAMA)
app.get('/', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        
        // --- DEĞİŞİKLİK: En son 3 filmi Slider için çekiyoruz ---
        const sliderMovies = await Movie.find().sort({ ai_generated_date: -1 }).limit(3);
        
        // Slider'daki filmlerin ID'lerini alalım ki aşağıda tekrar listelemeyelim
        const sliderIds = sliderMovies.map(m => m._id);

        // --- SAYFALAMA MANTIĞI ---
        const page = parseInt(req.query.page) || 1; 
        const limit = 5; 
        const skip = (page - 1) * limit;

        // Listeden slider filmlerini hariç tut ($nin = not in)
        let query = { _id: { $nin: sliderIds } }; 

        const totalMovies = await Movie.countDocuments(query);
        const totalPages = Math.ceil(totalMovies / limit);

        const moviesList = await Movie.find(query)
            .sort({ ai_generated_date: -1 })
            .skip(skip)
            .limit(limit);

        res.render('home', { 
            sliderMovies, // Artık tek film değil, liste gönderiyoruz
            movies: moviesList, 
            data: globalData,
            pageTitle: 'Ana Sayfa',
            currentPage: page,
            totalPages: totalPages
        });
    } catch (err) { console.log(err); res.send("Hata: " + err.message); }
});
// --- YENİ: ARAMA ROTASI (SEARCH) ---
app.get('/search', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        const query = req.query.q; // Formdan gelen "q" verisi (aranan kelime)

        if (!query) {
            return res.redirect('/');
        }

        // Veritabanında arama yap ($regex ile içinde geçeni bul, $options:'i' ile büyük/küçük harf duyarsız yap)
        const searchResults = await Movie.find({ 
            title: { $regex: query, $options: 'i' } 
        }).sort({ ai_generated_date: -1 });

        // Sonuçları göstermek için 'category' şablonunu kullanabiliriz (Tasarım aynı zaten)
        res.render('category', { 
            genreName: `Arama Sonuçları: "${query}"`, // Başlık
            movies: searchResults, 
            data: globalData, 
            pageTitle: `Ara: ${query}`
        });

    } catch (err) {
        console.log(err);
        res.redirect('/');
    }
});
// 2. DETAY SAYFASI (BENZER FİLMLER EKLENDİ)
app.get('/movie/:id', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        const movie = await Movie.findById(req.params.id);
        
        const primaryGenre = movie.genre ? movie.genre.split(',')[0].trim() : "Genel";
        const similarMovies = await Movie.find({
            genre: { $regex: primaryGenre, $options: 'i' },
            _id: { $ne: movie._id }
        }).limit(3);

        // --- BREADCRUMBS MANTIĞI GÜNCELLENDİ ---
        let breadcrumbs = [];

        // Eğer URL'de ?source=watchlist varsa:
        if (req.query.source === 'watchlist') {
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: 'İzleme Listem', url: '/watchlist' }, // Araya Watchlist koyduk
                { name: movie.title, url: null }
            ];
        } 
        // Yoksa (Normal Kategori yolu):
        else {
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: primaryGenre, url: `/genre/${primaryGenre}` },
                { name: movie.title, url: null }
            ];
        }
        // ---------------------------------------

        res.render('detail', { 
            movie, 
            similarMovies, 
            data: globalData, 
            pageTitle: movie.title,
            breadcrumbs: breadcrumbs 
        });
    } catch (err) { res.redirect('/'); }
});

// ... (Diğer rotalar aynı kalabilir) ...

app.get('/genre/:genreName', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        const genreName = req.params.genreName;
        const filteredMovies = await Movie.find({ genre: { $regex: genreName, $options: 'i' } });
        
        // --- BREADCRUMBS AYARI ---
        const breadcrumbs = [
            { name: 'Ana Sayfa', url: '/' },
            { name: genreName, url: null } // Şu anki kategori
        ];

        res.render('category', { 
            genreName, 
            movies: filteredMovies, 
            data: globalData, 
            pageTitle: genreName,
            breadcrumbs: breadcrumbs // <--- Bunu ekledik
        });
    } catch (err) { res.redirect('/'); }
});
// --- YENİ ROTA: RUH HALİ (MOOD) ---
app.get('/mood/:moodName', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        const moodName = req.params.moodName;
        
        // Veritabanındaki "moods" listesinde bu kelime geçen filmleri bul
        const filteredMovies = await Movie.find({ moods: moodName }).sort({ ai_generated_date: -1 });

        res.render('category', { // Kategori sayfasını kullanabiliriz, tasarımı aynı
            genreName: `${moodName} Modundaki`, // Başlık: "Hüzünlü Modundaki Filmler"
            movies: filteredMovies, 
            data: globalData, 
            pageTitle: `${moodName} Filmleri`
        });
    } catch (err) {
        res.redirect('/');
    }
});
app.post('/like/:id', async (req, res) => {
    await Movie.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } });
    const backURL = req.get('Referer') || '/';
    res.redirect(backURL);
});

app.post('/comment/:id', async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    if(movie){
        movie.comments.push({
            username: req.body.username || 'Anonim',
            text: req.body.text,
            rating: req.body.rating
        });
        await movie.save();
    }
    const backURL = req.get('Referer') || '/';
    res.redirect(backURL);
});
// --- DİĞER ROTALARIN ARASINA EKLE ---

// Hakkımızda Sayfası
app.get('/about', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        res.render('about', { 
            data: globalData, 
            pageTitle: 'Hakkımızda' 
        });
    } catch (err) {
        res.redirect('/');
    }
});
// --- YENİ: WATCHLIST API (ID listesine göre film verilerini döndürür) ---
app.use(express.json()); // JSON verilerini okumak için gerekli

app.post('/api/get-watchlist', async (req, res) => {
    try {
        const { movieIds } = req.body; // Frontend'den gelen ID listesi
        if (!movieIds || !Array.isArray(movieIds)) {
            return res.json([]);
        }
        // Bu ID'lere sahip filmleri bul
        const movies = await Movie.find({ _id: { $in: movieIds } });
        res.json(movies);
    } catch (err) {
        res.json([]);
    }
});

// --- YENİ: WATCHLIST SAYFASI (Boş iskelet) ---
app.get('/watchlist', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        res.render('watchlist', { 
            data: globalData, 
            pageTitle: 'İzleme Listem' 
        });
    } catch (err) {
        res.redirect('/');
    }
});
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 CineAI Yayında: http://localhost:${PORT}`));