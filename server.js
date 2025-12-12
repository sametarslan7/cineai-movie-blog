require('dotenv').config(); 

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const Movie = require('./models/movie');
const OpenAI = require('openai'); // <-- Bunu ekle
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

const dbURL = "mongodb+srv://sametarslan:sampersie29@cluster0.bwicwso.mongodb.net/MovieBlogDB?retryWrites=true&w=majority";
mongoose.connect(dbURL)
    .then(() => console.log('✅ CineAI Veritabanına Bağlandı'))
    .catch((err) => console.log('❌ Hata:', err));

// ... mongoose.connect(...) kodundan sonra:

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // .env dosyasındaki keyi kullanır
});


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

        // --- BREADCRUMBS GÜNCELLEMESİ ---
        let breadcrumbs = [];
        const source = req.query.source; // URL'den gelen notu al

        if (source === 'watchlist') {
            // İzleme Listesinden gelindiyse
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: 'İzleme Listem', url: '/watchlist' },
                { name: movie.title, url: null }
            ];
        } 
        else if (source === 'home') {
            // YENİ: Ana Sayfadan gelindiyse (Kategori gösterme)
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: movie.title, url: null }
            ];
        }
        else {
            // Varsayılan (Kategori sayfası, arama vs. üzerinden gelindiyse)
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: primaryGenre, url: `/genre/${primaryGenre}` },
                { name: movie.title, url: null }
            ];
        }
        // --------------------------------

        res.render('detail', { 
            movie, 
            similarMovies, 
            data: globalData, 
            pageTitle: movie.title,
            breadcrumbs: breadcrumbs 
        });
    } catch (err) { res.redirect('/'); }
});
// --- VERSUS (KARŞILAŞTIRMA) SAYFASI ---
app.get('/versus', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        // Dropdown için tüm filmleri çekiyoruz (İsim ve ID lazım)
        const allMovies = await Movie.find({},  'title _id posterUrl').sort({ title: 1 });
        
        res.render('versus', { 
            allMovies, 
            data: globalData, 
            pageTitle: 'AI Film Karşılaştırma' 
        });
    } catch (err) { res.redirect('/'); }
});

// --- VERSUS API (AI CEVABI İÇİN) ---
// --- VERSUS API (AI CEVABI İÇİN - GÜNCELLENMİŞ) ---
app.post('/api/versus', express.json(), async (req, res) => {
    try {
        const { id1, id2 } = req.body;
        
        const movie1 = await Movie.findById(id1);
        const movie2 = await Movie.findById(id2);

        if (!movie1 || !movie2) return res.status(404).json({ error: "Film bulunamadı." });

        // GÜNCELLEME 1: Prompt artık HTML şablonunu zorunlu kılıyor.
        const prompt = `
        Sen deneyimli, objektif ve biraz da esprili bir film eleştirmenisin.
        Aşağıdaki iki filmi karşılaştır:
        A Filmi: "${movie1.title}"
        B Filmi: "${movie2.title}"
        
        Cevabını SADECE aşağıdaki HTML formatında ver. Başlıkları ve yapıyı bozma. Cevabın yarım kalmasın.

        <h3>1. Atmosfer ve Ton Farkı</h3>
        <p>Buraya iki filmin havasını karşılaştıran kısa bir paragraf yaz.</p>

        <h3>2. Hangisi NeYde Daha İyi?</h3>
        <ul>
            <li><strong>${movie1.title}:</strong> Hangi konuda öne çıkıyor? (Senaryo, oyunculuk vb.)</li>
            <li><strong>${movie2.title}:</strong> Hangi konuda öne çıkıyor?</li>
        </ul>

        <h3>3. Son Karar: Kim İzlemeli?</h3>
        <p>Buraya net bir sonuç yaz. "Eğer X seviyorsan A'yı, Y seviyorsan B'yi izle" şeklinde bitir.</p>
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 700, // GÜNCELLEME 2: Token limitini artırdık (Yarım kalmasın diye)
            temperature: 0.7 // Tutarlılık için biraz düşürdük
        });

        res.json({ result: response.choices[0].message.content });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI şu an cevap veremiyor, lütfen tekrar dene." });
    }
});
// ... (Diğer rotalar aynı kalabilir) ...

app.get('/genre/:genreName', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        const genreName = req.params.genreName;
        const filteredMovies = await Movie.find({ genre: { $regex: genreName, $options: 'i' } });
        
        const breadcrumbs = [
            { name: 'Ana Sayfa', url: '/' },
            { name: genreName, url: null }
        ];

        res.render('category', { 
            genreName: `📂 Kategori: ${genreName}`, // Başlığı burada düzenledik
            movies: filteredMovies, 
            data: globalData, 
            pageTitle: genreName,
            breadcrumbs: breadcrumbs
        });
    } catch (err) { res.redirect('/'); }
});
// --- YENİ: OYUNCU FİLMOGRAFİSİ ---
// --- OYUNCU FİLMOGRAFİSİ ---
app.get('/actor/:name', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        const actorName = req.params.name;

        // URL'den gelen önceki film bilgilerini al
        const { fromMovie, fromId } = req.query;
        
        const movies = await Movie.find({ 
            actors: { $regex: actorName, $options: 'i' } 
        }).sort({ ai_generated_date: -1 });

        // --- BREADCRUMBS MANTIĞI ---
        let breadcrumbs = [];

        if (fromMovie && fromId) {
            // Eğer bir filmden gelindiyse: Ana Sayfa > Film Adı > Oyuncu
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: fromMovie, url: `/movie/${fromId}` }, // Önceki filme link veriyoruz
                { name: `Oyuncu: ${actorName}`, url: null }
            ];
        } else {
            // Doğrudan gelindiyse: Ana Sayfa > Oyuncu
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: `Oyuncu: ${actorName}`, url: null }
            ];
        }
        // -----------------------------

        res.render('category', { 
            genreName: `👤 Oyuncu: ${actorName}`, 
            movies: movies, 
            data: globalData, 
            pageTitle: `${actorName} Filmleri`,
            breadcrumbs: breadcrumbs
        });
    } catch (err) { res.redirect('/'); }
});
// --- YENİ: YÖNETMEN FİLMOGRAFİSİ ---
// --- YÖNETMEN FİLMOGRAFİSİ ---
app.get('/director/:name', async (req, res) => {
    try {
        const globalData = await getGlobalData();
        const directorName = req.params.name;
        
        // URL'den gelen önceki film bilgilerini al
        const { fromMovie, fromId } = req.query;

        const movies = await Movie.find({ 
            director: { $regex: directorName, $options: 'i' } 
        }).sort({ ai_generated_date: -1 });

        // --- BREADCRUMBS MANTIĞI ---
        let breadcrumbs = [];

        if (fromMovie && fromId) {
            // Eğer bir filmden gelindiyse: Ana Sayfa > Film Adı > Yönetmen
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: fromMovie, url: `/movie/${fromId}` }, // Önceki filme link veriyoruz
                { name: `Yönetmen: ${directorName}`, url: null }
            ];
        } else {
            // Doğrudan gelindiyse: Ana Sayfa > Yönetmen
            breadcrumbs = [
                { name: 'Ana Sayfa', url: '/' },
                { name: `Yönetmen: ${directorName}`, url: null }
            ];
        }
        // -----------------------------

        res.render('category', { 
            genreName: `🎬 Yönetmen: ${directorName}`, 
            movies: movies, 
            data: globalData, 
            pageTitle: `${directorName} Filmleri`,
            breadcrumbs: breadcrumbs
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