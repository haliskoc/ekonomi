# Proje Önerileri: Company Research Studio (ekonomi)

Bu proje zaten güçlü bir temele sahip (BIST100 hisse analizi, haber akışı, AI senaryo analizi). Aşağıda eklenebilecek yeni özellikler ve iyileştirmeleri kategorize ettim:

---

## 🚀 Yüksek Öncelikli Özellikler

### 1. **Şirket Otomatik Tamamlama (Autocomplete)**
- README'de zaten planlanmış - BIST100 + ABD borsaları için symbol autocomplete
- [`src/lib/bist100.ts`](src/lib/bist100.ts) verisini kullanarak dropdown ekle
- Kullanıcı deneyimini çok artıracak

### 2. **Redis Cache & Rate Limiting (Upstash)**
- README'de planlanmış - in-memory yerine Redis kullan
- Horizontal scaling için gerekli
- [`src/lib/rateLimit.ts`](src/lib/rateLimit.ts:1) ve [`src/lib/market.ts`](src/lib/market.ts:1) güncelle

### 3. **Kaydedilmiş Analizler (Saved Analyses)**
- README'de planlanmış
- Kullanıcıların analizlerini kaydetmesine izin ver
- [`src/lib/db.ts`](src/lib/db.ts:1) zaten Neon DB'ye bağlı - yeni tablo ekle

### 4. **Kullanım Analitikleri (Usage Analytics)**
- README'de planlanmış
- Hangi şirketler/piyasalar analiz ediliyor?
- Popülerlik trendleri

---

## 📊 Orta Öncelikli Özellikler

### 5. **Teknik Analiz Grafikleri**
- Hisse senedi grafikleri (candle stick, volume)
- TradingView widget entegrasyonu veya lightweight-charts kütüphanesi

### 6. **Finansal Tablolar**
- Gelir tablosu, bilanço, nakit akış tablosu
- Yahoo Finance API'den fundamental veriler

### 7. **Fiyat Alarmları / Bildirimler**
- Belirli bir fiyat seviyesinde email/push bildirimi
- Kullanıcı başına alarm limiti

### 8. **Karşılaştırma Özelliği**
- Aynı sektördeki 2-3 şirketi yan yana karşılaştır
- Fiyat performansı, P/E, P/B oranları karşılaştırması

### 9. **Seans Özeti (Market Summary)**
- Günlük BIST özeti (en çok kazanan/kaybeden, en yüksek hacim)
- Piyasa raporu oluştur

---

## ✨ Düşük Öncelikli / Eğlence Özellikler

### 10. **Portföy Takibi**
- Kullanıcı kendi portföyünü oluşturabilsin
- Toplam değer, günlük kar/zarar hesapla

### 11. **Makro Ekonomik Göstergeler**
- Dolar/Euro kuru, faiz oranları, enflasyon
- TCMB verileri çekilebilir

### 12. **Sektör Analizi**
- BIST sektör bazlı analiz
- Sektör bazlı haberler

### 13. **Daha Fazla Pazar**
- Avrupa borsaları (DAX, CAC, FTSE)
- Asya borsaları (Nikkei, Shanghai)

### 14. **API Dışa Aktarımı**
- Analizleri JSON/PDF olarak export et

### 15. **Çoklu Dil Desteği**
- İngilizce arayüz seçeneği
- [`src/lib/rssSources.ts`](src/lib/rssSources.ts:1) İngilizce haber kaynakları ekle

---

## 🛠 Altyapı İyileştirmeleri

| Özellik | Açıklama | Dosya |
|---------|----------|-------|
| **Test Coverage** | Unit testler ekle (Jest/Vitest) | `src/` |
| **Error Boundaries** | React error boundaries | `src/app/` |
| **Loading States** | Skeleton loaders | [`src/app/page.tsx`](src/app/page.tsx:1) |
| **PWA Support** | Progressive Web App | `next.config.ts` |
| **SEO Optimization** | Meta tags, OpenGraph | [`src/app/layout.tsx`](src/app/layout.tsx:1) |

---

## 🐛 Bug Fixes / Technical Debt

- [ ] RSS feed'leri için error handling iyileştir
- [ ] Rate limiter map boyut kontrolü (improvement report'ta var)
- [ ] Environment variables için validation ekle
- [ ] TypeScript strict mode tam aktif değilse aç

---

## 💡 Önerilen Başlama Sırası

1. **Autocomplete** → En çok kullanıcı deneyimi etkisi
2. **Redis cache** → Performans ve scaling
3. **Kaydedilmiş analizler** → Kullanıcı bağlılığı
4. **Teknik grafikler** → Görsel zenginleştirme

Hangi özellikler öncelikli olarak eklenmeli? Belirli bir özellik için detaylı implementasyon planı hazırlayabilirim.