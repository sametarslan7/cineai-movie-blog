const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    username: String,
    text: String,
    rating: Number,
    date: { type: Date, default: Date.now }
});

const movieSchema = new mongoose.Schema({
    title: String,
    summary: String,
    genre: String,
    tags: [String],
    actors: String,
    director: String,
    year: String,
    boxOffice: String,
    duration: String,
    posterUrl: String,
    likes: { type: Number, default: 0 },
    
    // --- YENİ EKLENEN KISIM: VIBE CHECK & MOOD ---
    vibe: {
        watch_if: String,   // "Şunu seviyorsan izle"
        skip_if: String,    // "Şundan hoşlanmıyorsan izleme"
        atmosphere: String  // "Gergin, Karanlık, Umut verici"
    },
    moods: [String],        // ["Hüzünlü", "Düşündürücü", "Heyecanlı"]
    // ---------------------------------------------

    ai_generated_date: { type: Date, default: Date.now },
    comments: [commentSchema]
});

module.exports = mongoose.model('Movie', movieSchema);