# Ücretsiz Borsa Veri ve Haber API'leri - Entegrasyon Tamamlandı ✅

Bu projede **borsa verisi** ve **haber** için birçok ücretsiz API/RSS kaynağı entegre edilmiştir.

## ═══════════════════════════════════════════════════════════════════════════
## BORSA VERİ API'LERİ
## ═══════════════════════════════════════════════════════════════════════════

### 1. Alpha Vantage ⭐
- **API Key:** `CK552N9Z086P34ZW` ✅
- **Limit:** 500 istek/gün, 5 istek/dakika
- **Dosya:** `src/lib/alphavantage.ts`
- **Fonksiyonlar:** Quote, Intraday, Daily, Symbol Search

### 2. Twelve Data ⭐
- **API Key:** `85a0eb5f930748fbb46756a6a1fe7812` ✅
- **Limit:** 800 API çağrısı/gün
- **Dosya:** `src/lib/twelvedata.ts`
- **Fonksiyonlar:** Quote, Time Series, Multiple Quotes, Forex, Symbol Search

### 3. Finnhub ⭐
- **API Key:** `d6vchlhr01qiiutba9kgd6vchlhr01qiiutba9l0` ✅
- **Limit:** 60 API çağrısı/dakika
- **Dosya:** `src/lib/finnhub.ts`
- **Fonksiyonlar:** Quote, Candles, Company Profile, **Company News**, **Market News**, Symbol Search

### 4. Yahoo Finance
- **API Key:** Gerekmiyor
- **Dosya:** `src/lib/yahoo.ts`
- **Not:** Otomatik fallback olarak kullanılır

## ═══════════════════════════════════════════════════════════════════════════
## HABER KAYNAKLARI
## ═══════════════════════════════════════════════════════════════════════════

### RSS Kaynakları (38 Türkçe + 24 İngilizce = 62 kaynak)

#### Türkçe Kaynaklar (38 adet)
- Bloomberg HT, NTV, Dünya, Hürriyet, Habertürk, TRT Haber
- Ekonomim, Anadolu Ajansı, Milliyet, Sözcü, Sabah, Cumhuriyet
- Bigpara, Investing TR, Ensonhaber, Haber7, T24
- **Yeni Eklenenler:**
  - Ekonomist, Capital, Türkiye Gazetesi, Yeni Şafak
  - Star, Akşam, Posta, Türkgün, Karar
  - Para Dergisi, Borsa Gündem, Uzmanpara, Finans Gündem
  - Doviz.com, Altın.in, Ekonomi Haberleri
  - Türkiye Sigorta, Kobiden, Ticaret Bakanlığı
  - **TÜİK**, **TCMB**

#### İngilizce Kaynaklar (24 adet)
- BBC Business, CNBC, Reuters, WSJ, MarketWatch
- Investing.com, Yahoo Finance, Financial Times
- Seeking Alpha, Business Insider, Federal Reserve
- IMF, OECD, NYTimes, Guardian, World Bank, ECB, FXStreet

### Haber API Servisleri (İsteğe Bağlı)

#### 1. NewsAPI.org
- **Limit:** 100 istek/gün, 50 sonuç/istek
- **Kayıt:** https://newsapi.org/register
- **Env:** `NEWSAPI_KEY`

#### 2. GNews API
- **Limit:** 100 istek/gün, 10 sonuç/istek
- **Kayıt:** https://gnews.io/register
- **Env:** `GNEWS_API_KEY`

#### 3. Currents API
- **Limit:** 600 istek/gün
- **Kayıt:** https://currentsapi.services/en/register
- **Env:** `CURRENTS_API_KEY`

#### 4. Mediastack
- **Limit:** 500 istek/ay, 25 sonuç/istek
- **Kayıt:** http://mediastack.com/signup/free
- **Env:** `MEDIASTACK_ACCESS_KEY`

## ═══════════════════════════════════════════════════════════════════════════
## API ENDPOINT'LERİ
## ═══════════════════════════════════════════════════════════════════════════

### Batch RSS/Haber Endpoint (YENİ) ✨
```
GET /api/rss/feeds?lang=tr&limit=50&includeNewsApis=true
```
- `lang`: `tr`, `en`, veya `all` (varsayılan: `all`)
- `limit`: 1-100 arası sonuç sayısı (varsayılan: 50)
- `sources`: Belirli kaynak ID'leri (virgülle ayrılmış)
- `includeNewsApis`: Haber API'lerini de dahil et (varsayılan: `false`)

**Örnek:**
```bash
# Tüm Türkçe haberleri çek
curl "http://localhost:3000/api/rss/feeds?lang=tr&limit=50"

# Haber API'leri ile birlikte
curl "http://localhost:3000/api/rss/feeds?lang=tr&limit=100&includeNewsApis=true"
```

### Tekil RSS Endpoint
```
GET /api/rss/fetch?url=https://www.bloomberght.com/rss
```

### Market Status
```
GET /api/market/status
```

### Market Summary
```
GET /api/markets/summary?market=bist100&provider=twelvedata
```

## ═══════════════════════════════════════════════════════════════════════════
## .env.local Dosyası
## ═══════════════════════════════════════════════════════════════════════════

```env
# Borsa veri API'leri (Entegre edildi ✅)
ALPHAVANTAGE_API_KEY=CK552N9Z086P34ZW
TWELVE_DATA_API_KEY=85a0eb5f930748fbb46756a6a1fe7812
FINNHUB_API_KEY=d6vchlhr01qiiutba9kgd6vchlhr01qiiutba9l0

# Haber API'leri (Opsiyonel - Ücretsiz kayıt yapın)
NEWSAPI_KEY=
GNEWS_API_KEY=
CURRENTS_API_KEY=
MEDIASTACK_ACCESS_KEY=
```

## ═══════════════════════════════════════════════════════════════════════════
## KULLANIM ÖRNEKLERİ
## ═══════════════════════════════════════════════════════════════════════════

### TypeScript Kullanımı

```typescript
// Borsa verisi
import { fetchMarketQuote, fetchChartData } from "@/lib/marketData";

const quote = await fetchMarketQuote("THYAO.IS", "twelvedata");
const candles = await fetchChartData("AAPL", "6mo");

// Haber API servisi
import { fetchAllNews, fetchNewsAPI, fetchGNews } from "@/lib/newsService";

const news = await fetchAllNews("economy finance", "en", 50);
const newsApiArticles = await fetchNewsAPI("stock market", "en", 20);
```

### API Kullanımı

```bash
# Türkçe haberler (sadece RSS)
curl "http://localhost:3000/api/rss/feeds?lang=tr&limit=30"

# Tüm haberler (RSS + Haber API'leri)
curl "http://localhost:3000/api/rss/feeds?lang=all&limit=100&includeNewsApis=true"

# Belirli kaynaklardan haber
curl "http://localhost:3000/api/rss/feeds?sources=bloomberght-ekonomi,ntv-ekonomi"
```

## ═══════════════════════════════════════════════════════════════════════════
## RATE LİMİT YÖNETİMİ
## ═══════════════════════════════════════════════════════════════════════════

| Provider | Dakika Limit | Günlük Limit | Cache Süresi |
|----------|--------------|--------------|--------------|
| Yahoo | - | - | 5 dakika |
| Alpha Vantage | 5 | 500 | 5 dakika |
| Twelve Data | 8 | 800 | 5 dakika |
| Finnhub | 60 | - | 1 dakika |
| NewsAPI | - | 100 | 10 dakika |
| GNews | - | 100 | 10 dakika |
| Currents | - | 600 | 10 dakika |
| Mediastack | - | 500/ay | 10 dakika |

## ═══════════════════════════════════════════════════════════════════════════
## AVANTAJLAR
## ═══════════════════════════════════════════════════════════════════════════

1. **Geniş Kapsam:** 62+ RSS kaynağı + 4 haber API'si
2. **Yedeklilik:** Bir kaynak çöse diğerleri devreye girer
3. **Esneklik:** İstediğiniz dili ve kaynağı seçebilirsiniz
4. **Finnhub Entegrasyonu:** Piyasa haberleri otomatik dahil edilir
5. **Deduplikasyon:** Aynı haber farklı kaynaklardan gelse bile tekilleştirilir
6. **Cache:** Rate limit'i verimli kullanmak için caching

## ═══════════════════════════════════════════════════════════════════════════
## SONRAKI ADIMLAR
## ═══════════════════════════════════════════════════════════════════════════

- [ ] Ücretsiz haber API'lerine kayıt yap (NewsAPI, GNews, Currents, Mediastack)
- [ ] .env.local dosyasına API key'leri ekle
- [ ] Haber sayfasını güncelle (yeni endpoint kullan)
- [ ] Şirket analiz sayfasını güncelle
- [ ] Teknik göstergeleri ekle