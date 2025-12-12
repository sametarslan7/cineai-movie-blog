import json
import requests
import time
from openai import OpenAI
from pymongo import MongoClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

# --- AYARLAR ---
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

api_key = os.getenv("OPENAI_API_KEY")

# !!! BURAYA TMDB API KEY'İNİ MUTLAKA YAZ !!!
TMDB_API_KEY = "df94cfb540ab5f769fda6bd36fce8794" 

# MongoDB Bağlantısı
mongo_uri = "mongodb+srv://sametarslan:sampersie29@cluster0.bwicwso.mongodb.net/MovieBlogDB?retryWrites=true&w=majority"

client = OpenAI(api_key=api_key)

try:
    db_client = MongoClient(mongo_uri)
    db = db_client["MovieBlogDB"]
    collection = db["movies"]
    print("✅ MongoDB Bağlantısı Başarılı.")
except Exception as e:
    print("❌ MongoDB Hatası:", e)
    exit()

def get_tmdb_poster(movie_title):
    """TMDB'den HD poster ve doğrulama yapar"""
    if not TMDB_API_KEY or "BURAYA" in TMDB_API_KEY:
        return "https://placehold.co/600x900?text=Afis+Yok"

    search_url = f"https://api.themoviedb.org/3/search/movie?api_key={TMDB_API_KEY}&query={movie_title}"
    try:
        response = requests.get(search_url).json()
        if response['results']:
            poster_path = response['results'][0]['poster_path']
            if poster_path:
                return f"https://image.tmdb.org/t/p/original{poster_path}"
    except Exception as e:
        print(f"Poster hatası: {e}")
    
    return "https://placehold.co/600x900?text=Afis+Bulunamadi"

def generate_movie_suggestion(existing_titles):
    """
    AI'dan film önerisi ister.
    existing_titles: Daha önce önerilmiş filmlerin listesi (AI bunlardan kaçınsın diye)
    """
    print("🤖 AI Film düşünüyor...")
    
    # Daha önce çıkan filmleri prompt'a ekleyip "Bunları önerme" diyoruz
    # (Liste çok uzunsa sadece son 50 tanesini ekleyelim ki token sınırı dolmasın)
    excluded_list = ", ".join(existing_titles[-50:]) 
    
    prompt = f"""
    Bana popüler, kült veya gizli kalmış kaliteli filmlerden rastgele bir tane öner.
    
    ÖNEMLİ KURALLAR:
    1. Şu filmleri ASLA önerme: {excluded_list}
    2. "actors" en az 3 kişi, "director" belirtilsin.
    
    3. "genre" kısmını SADECE şu listeden EN UYGUN olan 1 veya 2 tanesini seçerek yaz (Virgülle ayır):
    [Aksiyon, Bilim Kurgu, Dram, Komedi, Korku, Gerilim, Macera, Romantik, Fantastik, Animasyon]
    (Bunun dışında "Gizem", "Suç" gibi başka kelimeler KULLANMA. Örneğin suç filmiyse 'Gerilim' veya 'Aksiyon' seç.)

    Çıktıyı SADECE şu JSON formatında ver:
    {{
        "title": "Filmin Orijinal Adı",
        "summary": "Filmin detaylı Türkçe özeti.",
        "genre": "Seçilen Türler",
        "tags": ["Etiket1", "Etiket2"],
        "actors": "Oyuncular",
        "director": "Yönetmen",
        "year": "Yıl",
        "boxOffice": "Gişe",
        "duration": "Süre",
        "vibe": {{
            "watch_if": "...",
            "skip_if": "...",
            "atmosphere": "..."
        }},
        "moods": ["..."]
    }}
    """

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.9 # Yüksek yaratıcılık (farklı filmler bulması için)
        )
        content = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        print(f"AI Hatası: {e}")
        return None

def main():
    # 1. Veritabanındaki tüm film isimlerini çek
    existing_movies = collection.distinct("title")
    
    max_retries = 5 # En fazla 5 kere denesin, bulamazsa pes etsin (sonsuz döngü olmasın)
    attempt = 0
    
    while attempt < max_retries:
        # 2. AI'dan film iste
        movie_data = generate_movie_suggestion(existing_movies)
        
        if not movie_data:
            print("❌ AI veri üretemedi, tekrar deneniyor...")
            attempt += 1
            continue
            
        title = movie_data['title']
        
        # 3. KESİN KONTROL: Veritabanında bu isimde film var mı?
        if collection.find_one({"title": title}):
            print(f"⚠️ '{title}' zaten veritabanında var! Başka film aranıyor... ({attempt+1}/{max_retries})")
            attempt += 1
            time.sleep(1) # API'yi boğmamak için 1 saniye bekle
        else:
            # 4. Yeni film bulundu! Posteri al ve kaydet.
            print(f"✨ Yeni film bulundu: {title}")
            poster_url = get_tmdb_poster(title)
            movie_data['posterUrl'] = poster_url
            movie_data['ai_generated_date'] = datetime.now()
            
            collection.insert_one(movie_data)
            print(f"🎉 BAŞARILI: '{title}' veritabanına kaydedildi.")
            break
    
    if attempt == max_retries:
        print("❌ Üzgünüm, 5 denemede de yeni bir film bulamadım. Yarın tekrar dene!")

if __name__ == "__main__":
    main()