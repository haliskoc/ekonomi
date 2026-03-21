# Ücretsiz Borsa Veri API'leri - Entegrasyon Tamamlandı ✅

Bu projede **3 adet** ücretsiz API başarıyla entegre edilmiştir.

## Entegre Edilen API'ler

### 1. Alpha Vantage ⭐
- **API Key:** `CK552N9Z086P34ZW` ✅
- **Limit:** 500 istek/gün, 5 istek/dakika
- **Dosya:** `src/lib/alphavantage.ts`
- **Fonksiyonlar:**
  - `fetchAlphaVantageQuote()` - Anlık fiyat
  - `fetchAlphaVantageIntraday()` - Dakikalık veriler
  - `fetchAlphaVantageDaily()` - Günlük veriler
  - `searchAlphaVantageSymbol()` - Sembol arama

### 2. Twelve Data ⭐
- **API Key:** `85a0eb5f930748fbb46756a6a1fe7812` ✅
- **Limit:** 800 API çağrısı/gün
- **Dosya:** `src/lib/twelvedata.ts`
- **Fonksiyonlar:**
  - `fetchTwelveDataQuote()` - Anlık fiyat
  - `fetchTwelveDataTimeSeries()` - Zaman serisi verileri
  - `fetchTwelveDataMultipleQuotes()` - Çoklu sembol
  - `searchTwelveDataSymbol()` - Sembol arama
  - `fetchTwelveDataForex()` - Döviz kurları

### 3. Finnhub ⭐
- **API Key:** `d6vchlhr01qiiutba9kgd6vchlhr01qiiutba9l0` ✅
- **Limit:** 60 API çağrısı/dakika
- **Dosya:** `src/lib/finnhub.ts`
- **Fonksiyonlar:**
  - `fetchFinnhubQuote()` - Anlık fiyat
  - `fetchFinnhubCandles()` - Mum grafik verileri
  - `fetchFinnhubCompanyProfile()` - Şirket profili
  - `fetchFinnhubCompanyNews()` - Şirket haberleri
  - `fetchFinnhubMarketNews()` - Piyasa haberleri
  - `searchFinnhubSymbol()` - Sembol arama

### 4. Yahoo Finance (Mevcut)
- **API Key:** Gerekmiyor
- **Dosya:** `src/lib/yahoo.ts`
- **Not:** Resmi API değil, otomatik fallback olarak kullanılır

## Birleşik Servis: marketData.ts

Tüm API'ler tek bir serviste birleştirildi:

```typescript
import { fetchMarketQuote, fetchChartData, getMarketDataStatus } from "@/lib/marketData";

// Tek sembol çek (otomatik fallback)
const quote = await fetchMarketQuote("AAPL");

// Belirli bir provider ile çek
const quote = await fetchMarketQuote("THYAO.IS", "twelvedata");

// Grafik verisi
const candles = await fetchChartData("AAPL", "6mo");

// Provider durumunu kontrol et
const status = getMarketDataStatus();
```

## API Endpoint'leri

### Market Status
```
GET /api/market/status
```
Tüm provider'ların durumunu ve test sonuçlarını gösterir.

### Market Summary (Güncellendi)
```
GET /api/markets/summary?market=bist100&provider=twelvedata
```
- `market`: bist100 veya us
- `provider`: (opsiyonel) yahoo, alphavantage, twelvedata, finnhub

## Kullanım Örnekleri

### BIST Hisse Fiyatı
```typescript
// Twelve Data ile THYAO hissesi
const quote = await fetchMarketQuote("THYAO.IS", "twelvedata");
// Sonuç: { symbol: "THYAO.IS", price: 285.50, change: 2.3, ... }
```

### ABD Hisse Fiyatı
```typescript
// Finnhub ile Apple hissesi
const quote = await fetchMarketQuote("AAPL", "finnhub");
// Sonuç: { symbol: "AAPL", price: 178.25, change: -1.2, ... }
```

### Grafik Verisi
```typescript
// 6 aylık günlük veri
const candles = await fetchChartData("GARAN.IS", "6mo", "alphavantage");
// Sonuç: [{ date: "2024-01-01", open: 95.5, high: 97.2, ... }, ...]
```

## Fallback Mekanizması

Sistem otomatik olarak çalışır:
1. Belirtilen provider'ı dener
2. Hata alırsa diğer provider'lara geçer
3. İlk başarılı olan sonucu döndürür

## .env.local Dosyası

```env
# Borsa veri API'leri (Entegre edildi ✅)
ALPHAVANTAGE_API_KEY=CK552N9Z086P34ZW
TWELVE_DATA_API_KEY=85a0eb5f930748fbb46756a6a1fe7812
FINNHUB_API_KEY=d6vchlhr01qiiutba9kgd6vchlhr01qiiutba9l0
```

## Avantajlar

1. **Yedeklilik:** Bir API çökerse diğerleri devreye girer
2. **Esneklik:** İstediğiniz provider'ı seçebilirsiniz
3. **Kolay Kullanım:** Tek bir fonksiyon ile tüm API'lere erişim
4. **Tip Güvenliği:** TypeScript tipleri ile tam IntelliSense desteği

## Rate Limit Yönetimi

| Provider | Dakika Limit | Günlük Limit | Cache Süresi |
|----------|--------------|--------------|--------------|
| Yahoo | - | - | 5 dakika |
| Alpha Vantage | 5 | 500 | 5 dakika |
| Twelve Data | 8 | 800 | 5 dakika |
| Finnhub | 60 | - | 1 dakika |

## Sonraki Adımlar

- [ ] Şirket analiz sayfasını güncelle
- [ ] Teknik göstergeleri ekle
- [ ] Gerçek zamanlı veri akışı (WebSocket)
- [ ] Portföy takibi entegrasyonu