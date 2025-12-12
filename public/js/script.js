document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. MOBİL MENÜ (HAMBURGER) ---
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const navMenu = document.getElementById('nav-menu');

    if (hamburgerBtn && navMenu) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Varsayılan tıklamayı engelle
            navMenu.classList.toggle('active'); // Menüyü aç/kapa
            
            // İkon değiştirme
            const icon = hamburgerBtn.querySelector('i');
            if (navMenu.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-xmark');
            } else {
                icon.classList.remove('fa-xmark');
                icon.classList.add('fa-bars');
            }
        });
    }
    // --- MOBİL DROPDOWN (KATEGORİLER) ---
    const dropdownBtn = document.querySelector('.dropbtn');
    
    if (dropdownBtn) {
        dropdownBtn.addEventListener('click', (e) => {
            // Sadece mobilde (ekran küçükse) çalışsın
            if (window.innerWidth <= 768) {
                e.preventDefault(); // Linke gitmeyi engelle
                
                // .dropdown (üst element) sınıfına 'active' ekle/çıkar
                const parent = dropdownBtn.parentElement;
                parent.classList.toggle('active');
                
                // İkonu döndür (Opsiyonel görsel şıklık)
                const icon = dropdownBtn.querySelector('i');
                if (parent.classList.contains('active')) {
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        });
    }
    // --- 2. WATCHLIST (İZLEME LİSTESİ) ---
    updateButtons();
    if (document.getElementById('watchlist-grid')) {
        loadWatchlistMovies();
    }
});

// --- WATCHLIST FONKSİYONLARI ---
function toggleWatchlist(id, btnElement) {
    let watchlist = JSON.parse(localStorage.getItem('myWatchlist')) || [];
    
    if (watchlist.includes(id)) {
        watchlist = watchlist.filter(movieId => movieId !== id);
        btnElement.classList.remove('saved');
        btnElement.innerHTML = '<i class="fa-regular fa-bookmark"></i>';
    } else {
        watchlist.push(id);
        btnElement.classList.add('saved');
        btnElement.innerHTML = '<i class="fa-solid fa-bookmark"></i>';
    }
    localStorage.setItem('myWatchlist', JSON.stringify(watchlist));
}

function updateButtons() {
    const watchlist = JSON.parse(localStorage.getItem('myWatchlist')) || [];
    document.querySelectorAll('.btn-watchlist').forEach(btn => {
        const id = btn.getAttribute('data-id');
        if (watchlist.includes(id)) {
            btn.classList.add('saved');
            btn.innerHTML = '<i class="fa-solid fa-bookmark"></i>';
        }
    });
}

async function loadWatchlistMovies() {
    const watchlist = JSON.parse(localStorage.getItem('myWatchlist')) || [];
    const container = document.getElementById('watchlist-grid');
    const emptyMsg = document.getElementById('empty-msg');

    if (!watchlist.length) {
        if(emptyMsg) emptyMsg.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/get-watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ movieIds: watchlist })
        });
        
        const movies = await response.json();
        
        if (movies.length > 0) {
            if(emptyMsg) emptyMsg.style.display = 'none';
            movies.forEach(movie => {
                const html = `
                    <article class="movie-card-horizontal">
                        <div class="card-poster">
                            <img src="${movie.posterUrl}" alt="${movie.title}">
                        </div>
                        <div class="card-content">
                            <div class="card-header">
                                <h3>${movie.title} <span class="year">(${movie.year})</span></h3>
                                <button class="btn-watchlist saved" onclick="removeFromList('${movie._id}', this)">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <p class="short-summary">${movie.summary.substring(0, 100)}...</p>
                            <a href="/movie/${movie._id}?source=watchlist" class="read-more">İncele</a>
                        </div>
                    </article>
                `;
                container.innerHTML += html;
            });
        }
    } catch (error) { console.error(error); }
}

function removeFromList(id, btn) {
    toggleWatchlist(id, btn);
    location.reload(); 
}